import wasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_encoder.wasm?url&no-inline";
import wasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js?url&no-inline";

export interface DracoEncoderAssetUrls {
    readonly wasmBinaryUrl: string;
    readonly wasmWrapperUrl: string;
}

export function getDracoEncoderAssetUrls(): DracoEncoderAssetUrls {
    return { wasmBinaryUrl, wasmWrapperUrl };
}
