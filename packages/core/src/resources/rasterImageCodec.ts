export type RasterImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface DecodedRasterImage {
    readonly data: Uint8Array;
    readonly height: number;
    readonly width: number;
}

export interface RasterImageCodec {
    decodeAsync(image: Uint8Array, mimeType: RasterImageMimeType): Promise<DecodedRasterImage>;
    encodeAsync(image: DecodedRasterImage, mimeType: RasterImageMimeType): Promise<Uint8Array>;
    resizeAsync(image: Uint8Array, mimeType: RasterImageMimeType, maxSize: number): Promise<Uint8Array | null>;
    disposeAsync(): Promise<void>;
}

export function isRasterImageMimeType(value: string): value is RasterImageMimeType {
    return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

export function validateDecodedRasterImage(image: DecodedRasterImage): void {
    if (image.width < 1 || image.height < 1 || image.data.byteLength !== image.width * image.height * 4) {
        throw new Error("Raster image data must contain RGBA8 pixels with positive dimensions.");
    }
}
