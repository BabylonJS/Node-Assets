import type { Document, Texture } from "@gltf-transform/core";
import { EXTTextureWebP, KHRTextureBasisu } from "@gltf-transform/extensions";
import { listTextureSlots } from "@gltf-transform/functions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import type { KTX2Encoder } from "../resources/ktx2Encoder";
import { KTX2EncoderResource } from "../resources/ktx2EncoderResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { isRasterImageMimeType, type RasterImageCodec } from "../resources/rasterImageCodec";
import { RasterImageCodecResource } from "../resources/rasterImageCodecResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const ColorTextureSlotPattern = /color|emissive|diffuse/i;
const NormalTextureSlotPattern = /normal/i;

const EncodeKtx2BlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.encode-ktx2",
    input: GltfDocumentType,
    output: GltfDocumentType,
    resources: {
        io: PlatformIOResource,
        ktx2Encoder: KTX2EncoderResource,
        rasterImageCodec: RasterImageCodecResource,
    },
    runAsync: async (document, _config, { io, ktx2Encoder, rasterImageCodec }) => {
        io.registerExtensions([KHRTextureBasisu]);
        return encodeKtx2Async(document, rasterImageCodec, ktx2Encoder);
    },
});

/** Encodes compatible document textures as KTX2. */
export class EncodeKTX2Block extends Block<typeof EncodeKtx2BlockDefinition> {
    public constructor(options?: BlockOptions<typeof EncodeKtx2BlockDefinition>) {
        super(EncodeKtx2BlockDefinition, options);
    }
}

async function encodeKtx2Async(document: Document, rasterImageCodec: RasterImageCodec, ktx2Encoder: KTX2Encoder): Promise<Document> {
    let encodedTexture = false;

    await Promise.all(
        document
            .getRoot()
            .listTextures()
            .map(async (texture) => {
                const image = texture.getImage();
                const mimeType = texture.getMimeType();
                if (image === null || !isRasterImageMimeType(mimeType)) {
                    return;
                }

                const options = getTextureEncodingOptions(texture);
                if (options === null) {
                    return;
                }
                const decoded = await rasterImageCodec.decodeAsync(image, mimeType);
                texture.setImage(await ktx2Encoder.encodeAsync(decoded, options));
                texture.setMimeType("image/ktx2");
                updateTextureUri(texture);
                encodedTexture = true;
            })
    );

    if (encodedTexture) {
        document.createExtension(KHRTextureBasisu).setRequired(true);
    }
    if (
        !document
            .getRoot()
            .listTextures()
            .some((texture) => texture.getMimeType() === "image/webp")
    ) {
        document.disposeExtension(EXTTextureWebP.EXTENSION_NAME);
    }
    return document;
}

interface TextureEncodingOptions {
    readonly isNormalMap?: boolean;
    readonly isPerceptual: boolean;
    readonly isSetKTX2SRGBTransferFunc: boolean;
    readonly isUASTC: boolean;
    readonly useZstdSupercompression: boolean;
}

function getTextureEncodingOptions(texture: Texture): TextureEncodingOptions | null {
    const slots = listTextureSlots(texture);
    const hasColorUsage = slots.some((slot) => ColorTextureSlotPattern.test(slot));
    const hasNormalUsage = slots.some((slot) => NormalTextureSlotPattern.test(slot));
    const hasDataUsage = slots.some((slot) => !ColorTextureSlotPattern.test(slot) && !NormalTextureSlotPattern.test(slot));
    if (Number(hasColorUsage) + Number(hasNormalUsage) + Number(hasDataUsage) > 1) {
        return null;
    }
    if (hasColorUsage) {
        return {
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
            isUASTC: false,
            useZstdSupercompression: false,
        };
    }
    return {
        isNormalMap: hasNormalUsage,
        isPerceptual: false,
        isSetKTX2SRGBTransferFunc: false,
        isUASTC: true,
        useZstdSupercompression: true,
    };
}

function updateTextureUri(texture: Texture): void {
    const uri = texture.getURI();
    if (!uri || uri.startsWith("data:")) {
        return;
    }
    const pathEnd = uri.search(/[?#]/);
    const path = pathEnd === -1 ? uri : uri.slice(0, pathEnd);
    const slashIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const dotIndex = path.lastIndexOf(".");
    texture.setURI(dotIndex > slashIndex ? `${path.slice(0, dotIndex + 1)}ktx2` : `${path}.ktx2`);
}
