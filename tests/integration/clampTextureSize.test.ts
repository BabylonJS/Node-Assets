import { Document } from "@gltf-transform/core";
import { EXTTextureWebP, KHRTextureBasisu } from "@gltf-transform/extensions";
import { KTX2Decoder } from "@babylonjs/ktx2decoder";
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { ClampTextureSizeBlock, EncodeKTX2Block, GltfOutputBlock, NodeAsset } from "../../packages/core/src/index";
import { expectKtx2Image, getEmbeddedImageBytes, getTextureImageIndex, parseGlbAsync } from "../helpers/glb";

describe("texture size clamping", () => {
    it("decodes, resizes, and re-encodes oversized ETC1S KTX2 textures", async () => {
        const document = new Document();
        const source = await createKtx2ImageAsync(96, 48, { isUASTC: false, isInGammaSpace: true });
        const texture = document.createTexture("albedo").setURI("textures/albedo.ktx2").setExtras({ source: "test" }).setMimeType("image/ktx2").setImage(source);
        const material = document.createMaterial().setBaseColorTexture(texture);

        const result = await executeResizeAsync(document, 24);
        const resized = texture.getImage();

        expect(result).toBe(document);
        expect(resized).not.toBeNull();
        expect(resized).not.toEqual(source);
        expect(readKtx2Info(resized!)).toMatchObject({
            colorModel: 163,
            height: 12,
            isInGammaSpace: true,
            width: 24,
        });
        expect(material.getBaseColorTexture()).toBe(texture);
        expect(texture.getName()).toBe("albedo");
        expect(texture.getURI()).toBe("textures/albedo.ktx2");
        expect(texture.getMimeType()).toBe("image/ktx2");
        expect(texture.getExtras()).toEqual({ source: "test" });
    });

    it("resizes Zstd-supercompressed UASTC with alpha and rebuilt mipmaps", async () => {
        const document = new Document();
        const source = await createKtx2ImageAsync(16, 64, {
            generateMipmap: true,
            isInGammaSpace: false,
            isUASTC: true,
            needSupercompression: true,
        });
        const texture = document.createTexture().setMimeType("image/ktx2").setImage(source);

        await executeResizeAsync(document, 8);

        const resized = texture.getImage();
        expect(resized).not.toBeNull();
        expect(readKtx2Info(resized!)).toMatchObject({
            colorModel: 166,
            height: 8,
            isInGammaSpace: false,
            levelCount: 4,
            supercompressionScheme: 2,
            width: 2,
        });
        const decoded = await new KTX2Decoder().decode(resized!, {}, { forceRGBA: true });
        const topLevel = decoded.mipmaps[0];
        expect(decoded.errors).toBeUndefined();
        expect(decoded.hasAlpha).toBe(true);
        expect(decoded.isInGammaSpace).toBe(false);
        expect(topLevel?.data).not.toBeNull();
        expect(new Set(topLevel!.data)).not.toEqual(new Set([0]));
        expect(
            Array.from(topLevel!.data!)
                .filter((_value, index) => index % 4 === 3)
                .some((alpha) => alpha < 255)
        ).toBe(true);
    });

    it("preserves fine-pattern coverage when downsampling KTX2", async () => {
        const width = 64;
        const height = 32;
        const data = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const offset = (y * width + x) * 4;
                const value = x % 16 === 7 || x % 16 === 8 ? 255 : 0;
                data.set([value, value, value, 255], offset);
            }
        }
        const source = await encodeToKTX2(new Uint8Array(), {
            generateMipmap: false,
            imageDecoder: async () => ({ data, height, width }),
            isHDR: false,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
            isUASTC: true,
            needSupercompression: false,
        });
        const document = new Document();
        const texture = document.createTexture().setMimeType("image/ktx2").setImage(source);

        await executeResizeAsync(document, 4);

        const decoded = await new KTX2Decoder().decode(texture.getImage()!, {}, { forceRGBA: true });
        expect(decoded.errors).toBeUndefined();
        const pixels = decoded.mipmaps[0]?.data;
        expect(pixels).toHaveLength(4 * 2 * 4);
        // Each output pixel covers two white columns out of sixteen: 255 / 8 rounds to 32.
        for (let offset = 0; offset < pixels!.length; offset += 4) {
            for (let channel = 0; channel < 3; channel++) {
                expect(Math.abs(pixels![offset + channel]! - 32)).toBeLessThanOrEqual(5);
            }
            expect(pixels![offset + 3]).toBe(255);
        }
    });

    it("preserves independent encoding settings for mixed KTX2 textures", async () => {
        const document = new Document();
        const etc1s = document
            .createTexture("etc1s")
            .setMimeType("image/ktx2")
            .setImage(await createKtx2ImageAsync(96, 48, { isUASTC: false, isInGammaSpace: true }));
        const uastc = document
            .createTexture("uastc")
            .setMimeType("image/ktx2")
            .setImage(await createKtx2ImageAsync(32, 64, { isUASTC: true, isInGammaSpace: false, generateMipmap: true }));
        const zstd = document
            .createTexture("zstd")
            .setMimeType("image/ktx2")
            .setImage(await createKtx2ImageAsync(48, 24, { isUASTC: true, isInGammaSpace: true, needSupercompression: true }));

        await executeResizeAsync(document, 16);

        expect(readKtx2Info(etc1s.getImage()!)).toEqual({ colorModel: 163, width: 16, height: 8, isInGammaSpace: true, levelCount: 1, supercompressionScheme: 1 });
        expect(readKtx2Info(uastc.getImage()!)).toEqual({ colorModel: 166, width: 8, height: 16, isInGammaSpace: false, levelCount: 5, supercompressionScheme: 0 });
        expect(readKtx2Info(zstd.getImage()!)).toEqual({ colorModel: 166, width: 16, height: 8, isInGammaSpace: true, levelCount: 1, supercompressionScheme: 2 });
    });

    it("uses a 2048-pixel default cap", async () => {
        const document = new Document();
        const texture = document
            .createTexture()
            .setMimeType("image/png")
            .setImage(await createImageAsync(3000, 1500, "png"));

        await executeResizeAsync(document);

        await expectImage(texture.getImage(), { width: 2048, height: 1024, format: "png" });
    });

    it("preserves landscape and portrait aspect ratios with a configured cap", async () => {
        const document = new Document();
        const landscape = document
            .createTexture()
            .setMimeType("image/png")
            .setImage(await createImageAsync(400, 200, "png"));
        const portrait = document
            .createTexture()
            .setMimeType("image/jpeg")
            .setImage(await createImageAsync(200, 400, "jpeg"));

        await executeResizeAsync(document, 100);

        await expectImage(landscape.getImage(), { width: 100, height: 50, format: "png" });
        await expectImage(portrait.getImage(), { width: 50, height: 100, format: "jpeg" });
    });

    it.each([
        { orientation: 6, width: 10, height: 20, red: [5, 5], blue: [5, 15] },
        { orientation: 2, width: 20, height: 10, red: [15, 5], blue: [5, 5] },
    ] as const)("applies JPEG EXIF orientation $orientation before resizing", async ({ orientation, width, height, red, blue }) => {
        const document = new Document();
        const pixels = new Uint8Array(80 * 40 * 3);
        for (let y = 0; y < 40; y++) {
            for (let x = 0; x < 80; x++) {
                const offset = (y * 80 + x) * 3;
                pixels[offset] = x < 40 ? 240 : 20;
                pixels[offset + 1] = 20;
                pixels[offset + 2] = x < 40 ? 20 : 240;
            }
        }
        const image = await sharp(pixels, { raw: { width: 80, height: 40, channels: 3 } })
            .jpeg()
            .withMetadata({ orientation })
            .toBuffer();
        const texture = document.createTexture().setMimeType("image/jpeg").setImage(image);

        await executeResizeAsync(document, 20);

        await expectImage(texture.getImage(), { width, height, format: "jpeg" });
        const { data, info } = await sharp(texture.getImage()!).raw().toBuffer({ resolveWithObject: true });
        const redOffset = (red[1] * info.width + red[0]) * info.channels;
        const blueOffset = (blue[1] * info.width + blue[0]) * info.channels;
        expect(data[redOffset]).toBeGreaterThan(220);
        expect(data[redOffset + 2]).toBeLessThan(40);
        expect(data[blueOffset]).toBeLessThan(40);
        expect(data[blueOffset + 2]).toBeGreaterThan(220);
    });

    it.each([
        [7, 10, 3, 4],
        [10, 7, 4, 3],
    ])("rounds proportional dimensions to the nearest pixel for %sx%s", async (width, height, expectedWidth, expectedHeight) => {
        const document = new Document();
        const texture = document
            .createTexture()
            .setMimeType("image/png")
            .setImage(await createImageAsync(width, height, "png"));

        await executeResizeAsync(document, 4);

        await expectImage(texture.getImage(), { width: expectedWidth, height: expectedHeight, format: "png" });
    });

    it("keeps the dominant dimension at the cap for exact ratios", async () => {
        const document = new Document();
        const texture = document
            .createTexture()
            .setMimeType("image/png")
            .setImage(await createImageAsync(98, 49, "png"));

        await executeResizeAsync(document, 4);

        await expectImage(texture.getImage(), { width: 4, height: 2, format: "png" });
    });

    it("resizes WebP without changing its format", async () => {
        const document = new Document();
        document.createExtension(EXTTextureWebP).setRequired(true);
        const texture = document
            .createTexture()
            .setMimeType("image/webp")
            .setImage(await createImageAsync(120, 60, "webp"));

        await executeResizeAsync(document, 30);

        expect(texture.getMimeType()).toBe("image/webp");
        await expectImage(texture.getImage(), { width: 30, height: 15, format: "webp" });
    });

    it("clamps the smallest proportional dimension to one pixel", async () => {
        const document = new Document();
        const texture = document
            .createTexture()
            .setMimeType("image/png")
            .setImage(await createImageAsync(4096, 1, "png"));

        await executeResizeAsync(document, 2);

        await expectImage(texture.getImage(), { width: 2, height: 1, format: "png" });
    });

    it("does not upscale or re-encode textures within the cap", async () => {
        const document = new Document();
        const image = await createImageAsync(32, 16, "png");
        const texture = document.createTexture().setMimeType("image/png").setImage(image);

        await executeResizeAsync(document, 64);

        expect(texture.getImage()).toEqual(image);
    });

    it("keeps KTX2 textures within the cap byte-identical", async () => {
        const document = new Document();
        const image = await createKtx2ImageAsync(32, 16, { isInGammaSpace: true, isUASTC: false });
        const texture = document.createTexture().setMimeType("image/ktx2").setImage(image);

        await executeResizeAsync(document, 32);

        expect(texture.getImage()).toEqual(image);
    });

    it("preserves alpha, texture metadata, and material references", async () => {
        const document = new Document();
        const texture = document
            .createTexture("albedo")
            .setURI("textures/albedo.png")
            .setExtras({ source: "test" })
            .setImage(await createImageAsync(64, 32, "png", 0.5));
        const material = document.createMaterial().setBaseColorTexture(texture);

        const result = await executeResizeAsync(document, 16);
        const resizedImage = texture.getImage();
        expect(resizedImage).not.toBeNull();
        const metadata = await sharp(resizedImage!).metadata();

        expect(result).toBe(document);
        expect(material.getBaseColorTexture()).toBe(texture);
        expect(texture.getName()).toBe("albedo");
        expect(texture.getURI()).toBe("textures/albedo.png");
        expect(texture.getMimeType()).toBe("image/png");
        expect(texture.getExtras()).toEqual({ source: "test" });
        expect(metadata.hasAlpha).toBe(true);
        expect(metadata.channels).toBe(4);
        const { data, info } = await sharp(resizedImage!).raw().toBuffer({ resolveWithObject: true });
        expect(info.channels).toBe(4);
        for (let offset = 3; offset < data.length; offset += 4) {
            expect(data[offset]).toBeCloseTo(128, -1);
        }
    });

    it("leaves missing images and unsupported formats unchanged", async () => {
        const document = new Document();
        const missing = document.createTexture("missing").setMimeType("image/png");
        const unsupportedMimeType = document
            .createTexture("unsupported")
            .setMimeType("application/octet-stream")
            .setImage(await createImageAsync(20, 10, "png"));
        const unsupportedImage = unsupportedMimeType.getImage();

        await executeResizeAsync(document, 1);

        expect(missing.getImage()).toBeNull();
        expect(unsupportedMimeType.getImage()).toEqual(unsupportedImage);
        expect(unsupportedMimeType.getMimeType()).toBe("application/octet-stream");
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 1.5, null])("rejects invalid maxSize %s", (maxSize) => {
        expect(() => new ClampTextureSizeBlock({ maxSize: maxSize as number })).toThrow();
    });

    it.each([1, 2048])("rejects corrupt supported data at maxSize %s", async (maxSize) => {
        const document = new Document();
        const truncatedPng = (await createImageAsync(32, 16, "png")).subarray(0, 33);
        document.createTexture().setMimeType("image/png").setImage(truncatedPng);

        await expect(executeResizeAsync(document, maxSize)).rejects.toThrow();
    });

    it.each([1, 2048])("rejects corrupt KTX2 data at maxSize %s", async (maxSize) => {
        const document = new Document();
        document
            .createTexture()
            .setMimeType("image/ktx2")
            .setImage(new Uint8Array([1, 2, 3, 4]));

        await expect(executeResizeAsync(document, maxSize)).rejects.toThrow();
    });

    it("rejects oversized unsupported KTX2 variants", async () => {
        const source = await createKtx2ImageAsync(32, 16, { isInGammaSpace: true, isUASTC: true });
        const variants = [
            mutateKtx2(source, (header) => header.setUint32(28, 2, true)),
            mutateKtx2(source, (header) => header.setUint32(32, 1, true)),
            mutateKtx2(source, (header) => header.setUint32(32, 2, true)),
            mutateKtx2(source, (header) => header.setUint32(36, 6, true)),
            mutateKtx2(source, (header) => header.setUint32(12, 37, true)),
            mutateKtx2(source, (header) => {
                const dfdByteOffset = header.getUint32(48, true);
                header.setUint8(dfdByteOffset + 14, 3);
            }),
            mutateKtx2(source, (header) => {
                const dfdByteOffset = header.getUint32(48, true);
                header.setUint8(dfdByteOffset + 15, 1);
            }),
        ];

        for (const image of variants) {
            const document = new Document();
            document.createTexture().setMimeType("image/ktx2").setImage(image);
            await expect(executeResizeAsync(document, 8)).rejects.toThrow();
        }
    });

    it.each(["png", "ktx2"])("writes resized %s textures through a GLB pipeline", async (format) => {
        const document = new Document();
        document.createBuffer();
        const texture = document
            .createTexture("albedo")
            .setMimeType("image/png")
            .setImage(await createImageAsync(320, 160, "png"));
        document.createMaterial("material").setBaseColorTexture(texture);
        const resize = new ClampTextureSizeBlock({ input: document, maxSize: 80 });
        const destination = new GltfOutputBlock();
        if (format === "ktx2") {
            const encoder = new EncodeKTX2Block();
            resize.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);
        } else {
            resize.output.connectTo(destination.input);
        }

        const parsed = await parseGlbAsync(await new NodeAsset({ name: "clamp-texture-size-glb", outputBlock: destination }).executeAsync());
        const image = parsed.json.images?.[0];
        const imageIndex = getTextureImageIndex(parsed, parsed.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index);

        expect(image).toBeDefined();
        expect(imageIndex).toBe(0);
        const bytes = getEmbeddedImageBytes(parsed, image!);
        if (format === "ktx2") {
            expectKtx2Image(parsed);
            const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            // KTX2 stores pixelWidth and pixelHeight at byte offsets 20 and 24.
            expect([header.getUint32(20, true), header.getUint32(24, true)]).toEqual([80, 40]);
        } else {
            await expectImage(bytes, { width: 80, height: 40, format: "png" });
        }
    });

    it("writes an internally resized KTX2 texture through a GLB pipeline", async () => {
        const document = new Document();
        document.createBuffer();
        document.createExtension(KHRTextureBasisu).setRequired(true);
        const texture = document
            .createTexture("albedo")
            .setMimeType("image/ktx2")
            .setImage(await createKtx2ImageAsync(64, 32, { isInGammaSpace: true, isUASTC: false }));
        document.createMaterial("material").setBaseColorTexture(texture);
        const resize = new ClampTextureSizeBlock({ input: document, maxSize: 16 });
        const destination = new GltfOutputBlock();
        resize.output.connectTo(destination.input);

        const parsed = await parseGlbAsync(await new NodeAsset({ name: "resize-ktx2-glb", outputBlock: destination }).executeAsync());
        const image = parsed.json.images?.[0];
        const imageIndex = getTextureImageIndex(parsed, parsed.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.index);

        expect(image).toBeDefined();
        expect(imageIndex).toBe(0);
        expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
        expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
        expectKtx2Image(parsed);
        expect(readKtx2Info(getEmbeddedImageBytes(parsed, image!))).toMatchObject({ height: 8, width: 16 });
    });
});

async function executeResizeAsync(document: Document, maxSize?: number): Promise<Document> {
    const block = maxSize === undefined ? new ClampTextureSizeBlock({ input: document }) : new ClampTextureSizeBlock({ input: document, maxSize });
    return new NodeAsset({ name: "clamp-texture-size", outputBlock: block }).executeAsync();
}

async function createImageAsync(width: number, height: number, format: "jpeg" | "png" | "webp", alpha = 1): Promise<Uint8Array> {
    const channels = format === "jpeg" ? 3 : 4;
    const background = channels === 3 ? { r: 20, g: 40, b: 60 } : { r: 20, g: 40, b: 60, alpha };
    return sharp({ create: { width, height, channels, background } }).toFormat(format).toBuffer();
}

async function createKtx2ImageAsync(
    width: number,
    height: number,
    options: { readonly isInGammaSpace: boolean; readonly isUASTC: boolean; readonly generateMipmap?: boolean; readonly needSupercompression?: boolean }
): Promise<Uint8Array> {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            data[offset] = (x * 17 + y * 3) % 256;
            data[offset + 1] = (x * 5 + y * 19) % 256;
            data[offset + 2] = (x * 11 + y * 7) % 256;
            data[offset + 3] = (x + y) % 4 === 0 ? 96 : 255;
        }
    }
    return encodeToKTX2(new Uint8Array(), {
        generateMipmap: options.generateMipmap ?? false,
        imageDecoder: async () => ({ data, height, width }),
        isHDR: false,
        isPerceptual: options.isInGammaSpace,
        isSetKTX2SRGBTransferFunc: options.isInGammaSpace,
        isUASTC: options.isUASTC,
        needSupercompression: options.needSupercompression ?? false,
    });
}

function readKtx2Info(image: Uint8Array): {
    readonly colorModel: number;
    readonly height: number;
    readonly isInGammaSpace: boolean;
    readonly levelCount: number;
    readonly supercompressionScheme: number;
    readonly width: number;
} {
    const header = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const dfdByteOffset = header.getUint32(48, true);
    return {
        colorModel: header.getUint8(dfdByteOffset + 12),
        height: header.getUint32(24, true),
        isInGammaSpace: header.getUint8(dfdByteOffset + 14) === 2,
        levelCount: header.getUint32(40, true),
        supercompressionScheme: header.getUint32(44, true),
        width: header.getUint32(20, true),
    };
}

function mutateKtx2(image: Uint8Array, mutate: (header: DataView) => void): Uint8Array {
    const copy = Uint8Array.from(image);
    mutate(new DataView(copy.buffer));
    return copy;
}

async function expectImage(image: Uint8Array | null, expected: { readonly width: number; readonly height: number; readonly format: string }): Promise<void> {
    expect(image).not.toBeNull();
    const metadata = await sharp(image!).metadata();
    expect({ width: metadata.width, height: metadata.height, format: metadata.format }).toEqual(expected);
}
