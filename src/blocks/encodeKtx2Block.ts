import type { Document, Texture } from "@gltf-transform/core";
import { EXTTextureWebP, KHRTextureBasisu } from "@gltf-transform/extensions";
import { listTextureSlots } from "@gltf-transform/functions";
import type { IEncodeOptions } from "babylonpress-ktx2-encoder";
import type sharpFactory from "sharp";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { isNodeRuntime } from "../helpers/runtime";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const SupportedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const ColorTextureSlotPattern = /color|emissive|diffuse/i;
const NormalTextureSlotPattern = /normal/i;

const EncodeKtx2BlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.encode-ktx2",
    input: GltfDocumentType,
    output: GltfDocumentType,
    resources: {
        io: PlatformIOResource,
    },
    runAsync: async (document, _config, { io }) => {
        io.registerExtensions([KHRTextureBasisu]);
        return encodeKtx2Async(document);
    },
});

/** Encodes compatible document textures as KTX2. */
export class EncodeKTX2Block extends Block<typeof EncodeKtx2BlockDefinition> {
    public constructor(options?: BlockOptions<typeof EncodeKtx2BlockDefinition>) {
        super(EncodeKtx2BlockDefinition, options);
    }
}

async function encodeKtx2Async(document: Document): Promise<Document> {
    const [{ encodeToKTX2 }, platformOptions] = await Promise.all([import("babylonpress-ktx2-encoder"), createPlatformOptionsAsync()]);
    let encodedTexture = false;

    await Promise.all(
        document
            .getRoot()
            .listTextures()
            .map(async (texture) => {
                const image = texture.getImage();
                if (image === null || texture.getMimeType() === "image/ktx2" || !SupportedMimeTypes.has(texture.getMimeType())) {
                    return;
                }

                const options = {
                    isHDR: false,
                    ...platformOptions,
                    ...getTextureEncodingOptions(texture),
                } satisfies IEncodeOptions;
                texture.setImage(await encodeToKTX2(image, options));
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
}

function getTextureEncodingOptions(texture: Texture): TextureEncodingOptions {
    const slots = listTextureSlots(texture);
    if (slots.some((slot) => ColorTextureSlotPattern.test(slot))) {
        return {
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
        };
    }
    if (slots.some((slot) => NormalTextureSlotPattern.test(slot))) {
        return {
            isNormalMap: true,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
        };
    }
    return {
        isPerceptual: false,
        isSetKTX2SRGBTransferFunc: false,
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

interface PlatformEncodeOptions {
    readonly imageDecoder?: (buffer: Uint8Array) => Promise<{
        readonly data: Uint8Array;
        readonly height: number;
        readonly width: number;
    }>;
}

async function createPlatformOptionsAsync(): Promise<PlatformEncodeOptions> {
    if (!isNodeRuntime()) {
        return {};
    }

    const sharpModuleName = "sharp";
    const { default: sharp } = (await import(/* @vite-ignore */ sharpModuleName)) as { default: typeof sharpFactory };
    return {
        imageDecoder: async (buffer) => {
            const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            return {
                data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
                height: info.height,
                width: info.width,
            };
        },
    };
}
