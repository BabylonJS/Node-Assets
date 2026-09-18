import type { DecodedRasterImage } from "./rasterImageCodec";

export interface KTX2Encoding {
    readonly mode: "etc1s" | "uastc";
    readonly transferFunction: "linear" | "srgb";
    readonly mipmaps: boolean;
    readonly supercompression: "none" | "basis-lz" | "zstd";
}

export interface DecodedKTX2Image extends DecodedRasterImage {
    readonly encoding: KTX2Encoding;
}
