import type * as BabylonKTX2 from "@babylonjs/ktx2decoder";

import { isNodeRuntime } from "../helpers/isNodeRuntime";
import { loadNodePackageFileAsync } from "../helpers/loadNodePackageFile";
import type { DecodedKTX2Image, KTX2Encoding } from "./ktx2Image";

interface Ktx2Info {
    readonly colorModel: number;
    readonly flags: number;
    readonly height: number;
    readonly layerCount: number;
    readonly levelCount: number;
    readonly pixelDepth: number;
    readonly faceCount: number;
    readonly supercompressionScheme: number;
    readonly transferFunction: number;
    readonly typeSize: number;
    readonly vkFormat: number;
    readonly width: number;
}

type DecoderModule = typeof BabylonKTX2;

const Ktx2Identifier = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const Ktx2ColorModelEtc1s = 163;
const Ktx2ColorModelUastc = 166;
const Ktx2TransferLinear = 1;
const Ktx2TransferSrgb = 2;
const Ktx2SupercompressionNone = 0;
const Ktx2SupercompressionBasisLz = 1;
const Ktx2SupercompressionZstd = 2;

let mscDecoderPromise: Promise<void> | undefined;
let uastcSrgbDecoderPromise: Promise<void> | undefined;
let uastcUnormDecoderPromise: Promise<void> | undefined;
let zstdDecoderPromise: Promise<void> | undefined;
const DefaultZstdDecoderUrl = "https://cdn.babylonjs.com/zstddec.wasm";

export class KTX2Decoder {
    #modulesPromise: ReturnType<typeof loadDecoderModulesAsync> | undefined;

    public async inspectAsync(image: Uint8Array): Promise<Pick<DecodedKTX2Image, "width" | "height">> {
        const { width, height } = readKtx2Info(image);
        return { width, height };
    }

    public async decodeAsync(image: Uint8Array): Promise<DecodedKTX2Image> {
        const info = readKtx2Info(image);
        validateSupportedKtx2(info);
        const encoding: KTX2Encoding = {
            mode: info.colorModel === Ktx2ColorModelUastc ? "uastc" : "etc1s",
            transferFunction: info.transferFunction === Ktx2TransferSrgb ? "srgb" : "linear",
            mipmaps: info.levelCount > 1,
            supercompression: info.supercompressionScheme === Ktx2SupercompressionZstd ? "zstd" : info.supercompressionScheme === Ktx2SupercompressionBasisLz ? "basis-lz" : "none",
        };
        const modulesPromise = (this.#modulesPromise ??= loadDecoderModulesAsync());
        let modules: Awaited<typeof modulesPromise>;
        try {
            modules = await modulesPromise;
        } catch (error) {
            if (this.#modulesPromise === modulesPromise) {
                this.#modulesPromise = undefined;
            }
            throw error;
        }
        const [decoders, { EngineFormat }] = modules;
        await loadDecoderAssetsAsync(decoders, encoding);
        const decoded = await new decoders.KTX2Decoder().decode(image, {}, { forceRGBA: true });
        const topLevel = decoded.mipmaps[0];
        if (
            decoded.errors ||
            decoded.layerCount !== 1 ||
            decoded.transcodedFormat !== EngineFormat.RGBA8Format ||
            decoded.width !== info.width ||
            decoded.height !== info.height ||
            topLevel?.data === null ||
            topLevel?.data === undefined ||
            topLevel.width !== decoded.width ||
            topLevel.height !== decoded.height ||
            topLevel.layerIndex !== 0 ||
            topLevel.data.byteLength !== decoded.width * decoded.height * 4
        ) {
            throw new Error(
                `Unable to decode KTX2 texture to RGBA pixels: ${decoded.errors ?? `format=${decoded.transcodedFormat}, dimensions=${decoded.width}x${decoded.height}, layers=${decoded.layerCount}, topLevelBytes=${topLevel?.data?.byteLength ?? 0}`}`
            );
        }
        return {
            data: topLevel.data,
            height: decoded.height,
            width: decoded.width,
            encoding,
        };
    }
}

function loadDecoderModulesAsync() {
    return Promise.all([import("@babylonjs/ktx2decoder"), import("@babylonjs/core/Materials/Textures/ktx2decoderTypes.js")]);
}

async function loadDecoderAssetsAsync(decoders: DecoderModule, encoding: KTX2Encoding): Promise<void> {
    const decoderPromise = encoding.mode === "uastc" ? loadUastcDecoderAsync(decoders, encoding.transferFunction === "srgb") : loadMscDecoderAsync(decoders);
    await (encoding.supercompression === "zstd" ? Promise.all([decoderPromise, loadZstdDecoderAsync(decoders)]) : decoderPromise);
}

function loadMscDecoderAsync({ MSCTranscoder }: DecoderModule): Promise<void> {
    if (MSCTranscoder.JSModule !== null && MSCTranscoder.WasmBinary !== null) {
        return Promise.resolve();
    }
    if (mscDecoderPromise !== undefined) {
        return mscDecoderPromise;
    }
    const promise = (async () => {
        const [{ default: createMscTranscoderModule }, wasmBinary] = await Promise.all([
            import("virtual:node-assets-msc-transcoder"),
            loadDecoderAssetAsync("msc_basis_transcoder.wasm", () => import("@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.wasm?url&no-inline")),
        ]);
        MSCTranscoder.JSModule ??= createMscTranscoderModule;
        MSCTranscoder.WasmBinary ??= wasmBinary;
    })();
    mscDecoderPromise = promise;
    clearFailedInitialization(
        promise,
        () => mscDecoderPromise,
        (value) => (mscDecoderPromise = value)
    );
    return promise;
}

function loadUastcDecoderAsync({ LiteTranscoder_UASTC_RGBA_SRGB, LiteTranscoder_UASTC_RGBA_UNORM }: DecoderModule, isInGammaSpace: boolean): Promise<void> {
    if (isInGammaSpace) {
        if (LiteTranscoder_UASTC_RGBA_SRGB.WasmBinary !== null) {
            return Promise.resolve();
        }
        if (uastcSrgbDecoderPromise !== undefined) {
            return uastcSrgbDecoderPromise;
        }
        const promise = loadDecoderAssetAsync("uastc_rgba8_srgb_v2.wasm", () => import("@babylonjs/ktx2decoder/wasm/uastc_rgba8_srgb_v2.wasm?url&no-inline")).then((wasmBinary) => {
            LiteTranscoder_UASTC_RGBA_SRGB.WasmBinary ??= wasmBinary;
        });
        uastcSrgbDecoderPromise = promise;
        clearFailedInitialization(
            promise,
            () => uastcSrgbDecoderPromise,
            (value) => (uastcSrgbDecoderPromise = value)
        );
        return promise;
    }
    if (LiteTranscoder_UASTC_RGBA_UNORM.WasmBinary !== null) {
        return Promise.resolve();
    }
    if (uastcUnormDecoderPromise !== undefined) {
        return uastcUnormDecoderPromise;
    }
    const promise = loadDecoderAssetAsync("uastc_rgba8_unorm_v2.wasm", () => import("@babylonjs/ktx2decoder/wasm/uastc_rgba8_unorm_v2.wasm?url&no-inline")).then((wasmBinary) => {
        LiteTranscoder_UASTC_RGBA_UNORM.WasmBinary ??= wasmBinary;
    });
    uastcUnormDecoderPromise = promise;
    clearFailedInitialization(
        promise,
        () => uastcUnormDecoderPromise,
        (value) => (uastcUnormDecoderPromise = value)
    );
    return promise;
}

function loadZstdDecoderAsync({ ZSTDDecoder }: DecoderModule): Promise<void> {
    if (ZSTDDecoder.WasmModuleURL !== DefaultZstdDecoderUrl) {
        return Promise.resolve();
    }
    if (zstdDecoderPromise !== undefined) {
        return zstdDecoderPromise;
    }
    const promise = (async () => {
        const loadUrl = () => import("@babylonjs/ktx2decoder/wasm/zstddec.wasm?url&no-inline");
        const zstd = await loadDecoderAssetAsync("zstddec.wasm", loadUrl);
        if (ZSTDDecoder.WasmModuleURL !== DefaultZstdDecoderUrl) {
            return;
        }
        const objectUrl = URL.createObjectURL(new Blob([zstd]));
        ZSTDDecoder.WasmModuleURL = objectUrl;
        try {
            await new ZSTDDecoder().init();
        } finally {
            if (ZSTDDecoder.WasmModuleURL === objectUrl) {
                ZSTDDecoder.WasmModuleURL = DefaultZstdDecoderUrl;
            }
            URL.revokeObjectURL(objectUrl);
        }
    })();
    zstdDecoderPromise = promise;
    clearFailedInitialization(
        promise,
        () => zstdDecoderPromise,
        (value) => (zstdDecoderPromise = value)
    );
    return promise;
}

function clearFailedInitialization(promise: Promise<void>, getCurrent: () => Promise<void> | undefined, setCurrent: (value: Promise<void> | undefined) => void): void {
    void promise.catch(() => {
        if (getCurrent() === promise) {
            setCurrent(undefined);
        }
    });
}

async function loadDecoderAssetAsync(fileName: string, loadUrl: () => Promise<{ default: string }>): Promise<ArrayBuffer> {
    if (isNodeRuntime()) {
        return loadNodePackageFileAsync(`@babylonjs/ktx2decoder/wasm/${fileName}`);
    }
    const { default: url } = await loadUrl();
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Unable to load KTX2 decoder asset: ${response.status} ${response.statusText}`);
    }
    return response.arrayBuffer();
}

function readKtx2Info(image: Uint8Array): Ktx2Info {
    if (image.byteLength < 80 || !Ktx2Identifier.every((value, index) => image[index] === value)) {
        throw new Error("Unable to read KTX2 texture header.");
    }
    const data = new DataView(image.buffer, image.byteOffset, image.byteLength);
    const levelCount = data.getUint32(40, true);
    const dfdByteOffset = data.getUint32(48, true);
    const dfdByteLength = data.getUint32(52, true);
    if (levelCount < 1 || 80 + levelCount * 24 > image.byteLength || dfdByteLength < 28 || dfdByteOffset + dfdByteLength > image.byteLength) {
        throw new Error("Unable to read KTX2 texture structure.");
    }
    for (let level = 0; level < levelCount; level++) {
        const levelOffset = 80 + level * 24;
        const byteOffset = readUint64(data, levelOffset);
        const byteLength = readUint64(data, levelOffset + 8);
        if (byteLength < 1 || byteOffset + byteLength > image.byteLength) {
            throw new Error("Unable to read KTX2 texture levels.");
        }
    }
    return {
        colorModel: data.getUint8(dfdByteOffset + 12),
        faceCount: data.getUint32(36, true),
        flags: data.getUint8(dfdByteOffset + 15),
        height: data.getUint32(24, true),
        layerCount: data.getUint32(32, true),
        levelCount,
        pixelDepth: data.getUint32(28, true),
        supercompressionScheme: data.getUint32(44, true),
        transferFunction: data.getUint8(dfdByteOffset + 14),
        typeSize: data.getUint32(16, true),
        vkFormat: data.getUint32(12, true),
        width: data.getUint32(20, true),
    };
}

function readUint64(data: DataView, offset: number): number {
    const value = data.getBigUint64(offset, true);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("KTX2 texture offset exceeds the supported range.");
    }
    return Number(value);
}

function validateSupportedKtx2(info: Ktx2Info): void {
    const isEtc1s = info.colorModel === Ktx2ColorModelEtc1s;
    const isUastc = info.colorModel === Ktx2ColorModelUastc;
    const supportedSupercompression =
        (isEtc1s && info.supercompressionScheme === Ktx2SupercompressionBasisLz) ||
        (isUastc && (info.supercompressionScheme === Ktx2SupercompressionNone || info.supercompressionScheme === Ktx2SupercompressionZstd));
    if (
        info.width < 1 ||
        info.height < 1 ||
        info.pixelDepth !== 0 ||
        info.layerCount !== 0 ||
        info.faceCount !== 1 ||
        info.vkFormat !== 0 ||
        info.typeSize !== 1 ||
        (!isEtc1s && !isUastc) ||
        (info.transferFunction !== Ktx2TransferLinear && info.transferFunction !== Ktx2TransferSrgb) ||
        info.flags !== 0 ||
        !supportedSupercompression
    ) {
        throw new Error("This KTX2 texture variant cannot be decoded.");
    }
}
