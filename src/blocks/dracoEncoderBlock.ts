import type { IDracoCodecConfiguration } from "@babylonjs/core/Meshes/Compression/dracoCodec.js";
import wasmBinaryUrl from "@babylonjs/core/assets/Draco/draco_encoder.wasm?url&no-inline";
import wasmWrapperUrl from "@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js?url&no-inline";

import { createGltfMeshCompressionOptions, GltfMeshCompressionOptionsType, type GltfMeshCompressionOptions } from "../connectionPoints/gltfMeshCompressionOptions";
import { Block, type BlockOptions } from "./block";
import { defineSourceBlock } from "./blockDefinition";

const DracoEncoderBlockDefinition = /* @__PURE__ */ defineSourceBlock({
    type: "input.draco-encoder",
    output: GltfMeshCompressionOptionsType,
    runAsync: async (): Promise<GltfMeshCompressionOptions> => {
        await import("@babylonjs/core/Meshes/Compression/dracoEncoder.js").then(async ({ DracoEncoder }) => {
            await prepareDefaultEncoderAsync(DracoEncoder);
        });
        return createGltfMeshCompressionOptions({ meshCompressionMethod: "Draco" });
    },
});

/** Prepares Babylon.js's default Draco encoder and provides glTF mesh compression options that enable it. */
export class DracoEncoderBlock extends Block<typeof DracoEncoderBlockDefinition> {
    public constructor(options?: BlockOptions<typeof DracoEncoderBlockDefinition>) {
        super(DracoEncoderBlockDefinition, options);
    }
}

interface DracoEncoderConstructor {
    DefaultConfiguration: IDracoCodecConfiguration;
    ResetDefault(skipDispose?: boolean): void;
}

let defaultEncoderPreparationPromise: Promise<IDracoCodecConfiguration> | undefined;

async function prepareDefaultEncoderAsync(DracoEncoder: DracoEncoderConstructor): Promise<void> {
    if (!isBabylonDefaultConfiguration(DracoEncoder.DefaultConfiguration)) {
        return;
    }

    const preparationPromise = (defaultEncoderPreparationPromise ??= createDefaultEncoderConfigurationAsync());
    let configuration: IDracoCodecConfiguration;
    try {
        configuration = await preparationPromise;
    } finally {
        if (defaultEncoderPreparationPromise === preparationPromise) {
            defaultEncoderPreparationPromise = undefined;
        }
    }

    if (!isBabylonDefaultConfiguration(DracoEncoder.DefaultConfiguration)) {
        return;
    }
    DracoEncoder.ResetDefault(true);
    DracoEncoder.DefaultConfiguration = configuration;
}

async function createDefaultEncoderConfigurationAsync(): Promise<IDracoCodecConfiguration> {
    if (isNode()) {
        const { createNodeDracoEncoderConfigurationAsync } = await import("../helpers/nodeDracoEncoder");
        return await createNodeDracoEncoderConfigurationAsync();
    }
    return {
        wasmBinaryUrl,
        wasmUrl: wasmWrapperUrl,
    };
}

function isNode(): boolean {
    return (
        typeof process === "object" &&
        process.release?.name === "node" &&
        process.versions?.node !== undefined &&
        !(process.versions.electron !== undefined && typeof window === "object")
    );
}

function isBabylonDefaultConfiguration(configuration: IDracoCodecConfiguration): boolean {
    return (
        configuration.wasmUrl === "https://cdn.babylonjs.com/draco_encoder_wasm_wrapper.js" &&
        configuration.wasmBinaryUrl === "https://cdn.babylonjs.com/draco_encoder.wasm" &&
        configuration.fallbackUrl === "https://cdn.babylonjs.com/draco_encoder.js" &&
        configuration.jsModule === undefined &&
        configuration.numWorkers === undefined &&
        configuration.wasmBinary === undefined &&
        configuration.workerPool === undefined
    );
}
