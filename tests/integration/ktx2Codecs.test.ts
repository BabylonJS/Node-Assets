import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
import { describe, expect, it } from "vitest";

import { KTX2Decoder } from "../../packages/core/src/resources/ktx2Decoder";
import { KTX2Encoder } from "../../packages/core/src/resources/ktx2Encoder";

describe("KTX2 codec round trips", () => {
    it("keeps encoding settings with each decoded image", async () => {
        const decoder = new KTX2Decoder();
        const encoder = new KTX2Encoder();
        const etc1s = await createImageAsync(false);
        const uastc = await createImageAsync(true);

        await expect(decoder.inspectAsync(etc1s)).resolves.toEqual({ width: 32, height: 16 });
        const [first, second] = await Promise.all([decoder.decodeAsync(etc1s), decoder.decodeAsync(uastc)]);
        const [secondResult, firstResult] = await Promise.all([encoder.encodeAsync(second), encoder.encodeAsync(first)]);

        expect(readEncoding(firstResult)).toEqual({ mode: 163, transfer: 2, levels: 1, compression: 1 });
        expect(readEncoding(secondResult)).toEqual({ mode: 166, transfer: 1, levels: 6, compression: 2 });
    });

    it("applies partial overrides without changing the source encoding settings", async () => {
        const decoder = new KTX2Decoder();
        const encoder = new KTX2Encoder();
        const image = await decoder.decodeAsync(await createImageAsync(true));

        const withoutMipmaps = await encoder.encodeAsync(image, { generateMipmaps: false });
        const asEtc1s = await encoder.encodeAsync(image, { isUASTC: false });
        const unchangedSettings = await encoder.encodeAsync(image);

        expect(readEncoding(withoutMipmaps)).toEqual({ mode: 166, transfer: 1, levels: 1, compression: 2 });
        expect(readEncoding(asEtc1s)).toEqual({ mode: 163, transfer: 1, levels: 6, compression: 1 });
        expect(readEncoding(unchangedSettings)).toEqual({ mode: 166, transfer: 1, levels: 6, compression: 2 });
    });
});

function createImageAsync(isUASTC: boolean): Promise<Uint8Array> {
    const data = new Uint8Array(32 * 16 * 4).fill(127);
    return encodeToKTX2(new Uint8Array(), {
        imageDecoder: async () => ({ data, width: 32, height: 16 }),
        isHDR: false,
        isUASTC,
        isPerceptual: !isUASTC,
        isSetKTX2SRGBTransferFunc: !isUASTC,
        generateMipmap: isUASTC,
        needSupercompression: isUASTC,
    });
}

function readEncoding(image: Uint8Array): { readonly mode: number; readonly transfer: number; readonly levels: number; readonly compression: number } {
    const header = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const dfdOffset = header.getUint32(48, true);
    return {
        mode: header.getUint8(dfdOffset + 12),
        transfer: header.getUint8(dfdOffset + 14),
        levels: header.getUint32(40, true),
        compression: header.getUint32(44, true),
    };
}
