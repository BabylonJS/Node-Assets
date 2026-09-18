import type { Document } from "@gltf-transform/core";
import { KHRTextureBasisu } from "@gltf-transform/extensions";

import { defineConnectionPointType } from "../connectionPoints/connectionPoint";
import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { fitImageSize } from "../helpers/fitImageSize";
import type { KTX2Decoder } from "../resources/ktx2Decoder";
import { KTX2DecoderResource } from "../resources/ktx2DecoderResource";
import type { KTX2Encoder } from "../resources/ktx2Encoder";
import { KTX2EncoderResource } from "../resources/ktx2EncoderResource";
import type { DecodedKTX2Image } from "../resources/ktx2Image";
import { PlatformIOResource } from "../resources/platformIOResource";
import { isRasterImageMimeType, type RasterImageCodec } from "../resources/rasterImageCodec";
import { RasterImageCodecResource } from "../resources/rasterImageCodecResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock, value } from "./blockDefinition";

const PixelCheckInterval = 65536;
const YieldIntervalMs = 8;
const MaximumTextureSizeType = /* @__PURE__ */ defineConnectionPointType<number>(
    "positive-integer",
    (candidate): candidate is number => typeof candidate === "number" && Number.isFinite(candidate) && Number.isInteger(candidate) && candidate > 0
);

const ClampTextureSizeBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.clamp-texture-size",
    input: GltfDocumentType,
    output: GltfDocumentType,
    config: {
        maxSize: /* @__PURE__ */ value(MaximumTextureSizeType, 2048),
    },
    resources: {
        io: PlatformIOResource,
        ktx2Decoder: KTX2DecoderResource,
        ktx2Encoder: KTX2EncoderResource,
        rasterImageCodec: RasterImageCodecResource,
    },
    runAsync: (document, { maxSize }, { io, ktx2Decoder, ktx2Encoder, rasterImageCodec }) => {
        if (
            document
                .getRoot()
                .listTextures()
                .some((texture) => texture.getMimeType() === "image/ktx2")
        ) {
            io.registerExtensions([KHRTextureBasisu]);
        }
        return clampTextureSizesAsync(document, maxSize, rasterImageCodec, ktx2Decoder, ktx2Encoder);
    },
});

/** Options for limiting texture dimensions. */
export type ClampTextureSizeBlockOptions = BlockOptions<typeof ClampTextureSizeBlockDefinition>;

/** Proportionally downsizes compatible textures without upscaling. */
export class ClampTextureSizeBlock extends Block<typeof ClampTextureSizeBlockDefinition> {
    public constructor(options?: ClampTextureSizeBlockOptions) {
        super(ClampTextureSizeBlockDefinition, options);
    }
}

async function clampTextureSizesAsync(
    document: Document,
    maxSize: number,
    rasterImageCodec: RasterImageCodec,
    ktx2Decoder: KTX2Decoder,
    ktx2Encoder: KTX2Encoder
): Promise<Document> {
    for (const texture of document.getRoot().listTextures()) {
        const image = texture.getImage();
        if (image === null) {
            continue;
        }
        const mimeType = texture.getMimeType();
        if (mimeType === "image/ktx2") {
            const info = await ktx2Decoder.inspectAsync(image);
            if (info.width <= maxSize && info.height <= maxSize) {
                continue;
            }
            const decoded = await ktx2Decoder.decodeAsync(image);
            const resized = await resizeImageAsync(decoded, maxSize);
            texture.setImage(await ktx2Encoder.encodeAsync(resized));
            continue;
        }
        if (!isRasterImageMimeType(mimeType)) {
            continue;
        }

        const resizedImage = await rasterImageCodec.resizeAsync(image, mimeType, maxSize);
        if (resizedImage !== null) {
            texture.setImage(resizedImage);
        }
    }
    return document;
}

async function resizeImageAsync(image: DecodedKTX2Image, maxSize: number): Promise<DecodedKTX2Image> {
    const { data: source, width: sourceWidth, height: sourceHeight } = image;
    const [width, height] = fitImageSize(sourceWidth, sourceHeight, maxSize);
    const destination = new Uint8Array(width * height * 4);
    const scaleX = sourceWidth / width;
    const scaleY = sourceHeight / height;
    let processedPixels = 0;
    let yieldAt = performance.now() + YieldIntervalMs;
    for (let y = 0; y < height; y++) {
        const top = y * scaleY;
        const bottom = Math.min(sourceHeight, (y + 1) * scaleY);
        for (let x = 0; x < width; x++) {
            const left = x * scaleX;
            const right = Math.min(sourceWidth, (x + 1) * scaleX);
            const firstSourceX = Math.floor(left);
            const sourceXEnd = Math.ceil(right);
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            // Integrate the whole source footprint with premultiplied color, then restore straight alpha.
            for (let sourceY = Math.floor(top); sourceY < Math.ceil(bottom); sourceY++) {
                const overlapY = Math.min(bottom, sourceY + 1) - Math.max(top, sourceY);
                for (let sourceX = firstSourceX; sourceX < sourceXEnd; sourceX++) {
                    const overlapX = Math.min(right, sourceX + 1) - Math.max(left, sourceX);
                    const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
                    const alphaWeight = source[sourceOffset + 3]! * overlapX * overlapY;
                    red += source[sourceOffset]! * alphaWeight;
                    green += source[sourceOffset + 1]! * alphaWeight;
                    blue += source[sourceOffset + 2]! * alphaWeight;
                    alpha += alphaWeight;
                }
                // Check within source footprints so even a reduction to one pixel can yield.
                processedPixels += sourceXEnd - firstSourceX;
                if (processedPixels >= PixelCheckInterval) {
                    processedPixels = 0;
                    if (performance.now() >= yieldAt) {
                        await new Promise<void>((resolve) => setTimeout(resolve, 0));
                        yieldAt = performance.now() + YieldIntervalMs;
                    }
                }
            }
            const destinationOffset = (y * width + x) * 4;
            destination[destinationOffset] = alpha === 0 ? 0 : Math.round(red / alpha);
            destination[destinationOffset + 1] = alpha === 0 ? 0 : Math.round(green / alpha);
            destination[destinationOffset + 2] = alpha === 0 ? 0 : Math.round(blue / alpha);
            destination[destinationOffset + 3] = Math.round(alpha / ((right - left) * (bottom - top)));
        }
    }
    return {
        ...image,
        data: destination,
        width,
        height,
    };
}
