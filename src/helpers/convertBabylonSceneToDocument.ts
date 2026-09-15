import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";
import type { Document, PlatformIO } from "@gltf-transform/core";
import type sharpFactory from "sharp";

import { createDataUri } from "./loadSceneWithPlugin";
import { isNodeRuntime } from "./runtime";

export async function convertBabylonSceneToDocumentAsync(scene: BabylonScene, io: PlatformIO): Promise<Document> {
    try {
        await embedExternalTextureDataAsync(scene);
        const { GLTF2Export } = await import("@babylonjs/serializers/glTF/2.0/index.js");
        const fileName = "scene.glb";
        const result = await GLTF2Export.GLBAsync(scene, fileName);
        const root = result.files[fileName];
        if (!(root instanceof Blob)) {
            throw new Error(`The Babylon glTF serializer did not produce "${fileName}".`);
        }
        return io.readBinary(new Uint8Array(await root.arrayBuffer()));
    } finally {
        scene.dispose();
    }
}

async function embedExternalTextureDataAsync(scene: BabylonScene): Promise<void> {
    const texturesByUrl = new Map<string, UrlTexture[]>();
    for (const texture of scene.textures) {
        if (!isUrlTexture(texture) || texture.url === null || texture.url.startsWith("data:")) {
            continue;
        }
        const textures = texturesByUrl.get(texture.url) ?? [];
        textures.push(texture);
        texturesByUrl.set(texture.url, textures);
    }

    await Promise.all(
        Array.from(texturesByUrl, async ([url, textures]) => {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load texture "${url}": HTTP ${response.status} ${response.statusText}`.trim());
            }
            const mimeType = getImageMimeType(response.headers.get("content-type"), response.url || url);
            const prepared = await prepareImageAsync(new Uint8Array(await response.arrayBuffer()), mimeType);
            const dataUri = createDataUri(prepared.data, prepared.mimeType);
            const extension = getImageExtension(prepared.mimeType);
            await Promise.all(textures.map((texture) => updateTextureAsync(texture, dataUri, extension)));
        })
    );
}

interface PreparedImage {
    readonly data: Uint8Array;
    readonly mimeType: string;
}

interface RawImage {
    readonly data: Uint8Array;
    readonly height: number;
    readonly width: number;
}

async function prepareImageAsync(data: Uint8Array, mimeType: string): Promise<PreparedImage> {
    if (mimeType !== "image/bmp" && mimeType !== "image/gif" && mimeType !== "image/x-tga") {
        return { data, mimeType };
    }

    const raw = mimeType === "image/x-tga" ? await decodeTgaAsync(data) : await decodeImageAsync(data);
    return {
        data: await encodePngAsync(raw),
        mimeType: "image/png",
    };
}

async function decodeTgaAsync(data: Uint8Array): Promise<RawImage> {
    const { GetTGAHeader, UploadContent } = await import("@babylonjs/core/Misc/tga.js");
    const header = GetTGAHeader(data) as { readonly height: number; readonly width: number };
    let pixels: Uint8Array | undefined;
    const texture = {
        getEngine: () => ({
            _uploadDataToTextureDirectly: (_texture: unknown, imageData: ArrayBufferView) => {
                pixels = new Uint8Array(imageData.buffer, imageData.byteOffset, imageData.byteLength);
            },
        }),
    };
    UploadContent(texture as Parameters<typeof UploadContent>[0], data);
    if (pixels === undefined) {
        throw new Error("Unable to decode TGA texture.");
    }
    return { data: pixels, height: header.height, width: header.width };
}

async function decodeImageAsync(data: Uint8Array): Promise<RawImage> {
    if (isNodeRuntime()) {
        const sharp = await loadSharpAsync();
        const decoded = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        return {
            data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
            height: decoded.info.height,
            width: decoded.info.width,
        };
    }

    const image = await createImageBitmap(new Blob([Uint8Array.from(data).buffer]));
    try {
        const canvas = new OffscreenCanvas(image.width, image.height);
        const context = canvas.getContext("2d");
        if (context === null) {
            throw new Error("Unable to create a 2D canvas context.");
        }
        context.drawImage(image, 0, 0);
        return {
            data: new Uint8Array(context.getImageData(0, 0, image.width, image.height).data),
            height: image.height,
            width: image.width,
        };
    } finally {
        image.close();
    }
}

async function encodePngAsync(image: RawImage): Promise<Uint8Array> {
    if (isNodeRuntime()) {
        const sharp = await loadSharpAsync();
        const png = await sharp(image.data, { raw: { channels: 4, height: image.height, width: image.width } })
            .png()
            .toBuffer();
        return new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
    }

    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    if (context === null) {
        throw new Error("Unable to create a 2D canvas context.");
    }
    context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
}

async function loadSharpAsync(): Promise<typeof sharpFactory> {
    const sharpModuleName = "sharp";
    return (await import(/* @vite-ignore */ sharpModuleName)).default as typeof sharpFactory;
}

interface UrlTexture extends BaseTexture {
    readonly url: string | null;
    updateURL(url: string, buffer: string, onLoad: () => void, forcedExtension: string): void;
}

function isUrlTexture(texture: BaseTexture): texture is UrlTexture {
    return "url" in texture && "updateURL" in texture && typeof texture.updateURL === "function";
}

function updateTextureAsync(texture: UrlTexture, dataUri: string, extension: string): Promise<void> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let internalTexture: ReturnType<UrlTexture["getInternalTexture"]>;
        const cleanup = () => {
            internalTexture?.onErrorObservable.removeCallback(onError);
        };
        const onLoad = () => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve();
        };
        const onError = ({ message, exception }: { readonly exception?: unknown; readonly message?: string }) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(new Error(message ?? "Failed to update texture.", { cause: exception }));
        };

        try {
            texture.updateURL(dataUri, dataUri, onLoad, extension);
            if (settled) {
                return;
            }
            internalTexture = texture.getInternalTexture();
            if (internalTexture === null) {
                throw new Error("Texture update did not create an internal texture.");
            }
            internalTexture.onErrorObservable.add(onError);
        } catch (error) {
            settled = true;
            cleanup();
            reject(error);
        }
    });
}

function getImageMimeType(contentType: string | null, url: string): string {
    const mimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (mimeType?.startsWith("image/")) {
        return mimeType;
    }
    const extension = new URL(url).pathname.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "avif":
            return "image/avif";
        case "bmp":
            return "image/bmp";
        case "gif":
            return "image/gif";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "ktx2":
            return "image/ktx2";
        case "png":
            return "image/png";
        case "tga":
            return "image/x-tga";
        case "webp":
            return "image/webp";
        default:
            throw new Error(`Unable to determine the image format for texture "${url}".`);
    }
}

function getImageExtension(mimeType: string): string {
    switch (mimeType) {
        case "image/avif":
            return ".avif";
        case "image/bmp":
            return ".bmp";
        case "image/gif":
            return ".gif";
        case "image/jpeg":
            return ".jpg";
        case "image/ktx2":
            return ".ktx2";
        case "image/png":
            return ".png";
        case "image/webp":
            return ".webp";
        case "image/x-tga":
            return ".tga";
        default:
            throw new Error(`Unsupported texture MIME type "${mimeType}".`);
    }
}
