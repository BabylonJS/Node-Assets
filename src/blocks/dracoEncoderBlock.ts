import type { IDracoCodecConfiguration } from "@babylonjs/core/Meshes/Compression/dracoCodec.js";

import { createGltfMeshCompressionOptions, GltfMeshCompressionOptionsType, type GltfMeshCompressionOptions } from "../connectionPoints/gltfMeshCompressionOptions";
import { Block, type BlockOptions } from "./block";
import { defineSourceBlock } from "./blockDefinition";

const DracoEncoderBlockDefinition = /* @__PURE__ */ defineSourceBlock({
    type: "input.draco-encoder",
    output: GltfMeshCompressionOptionsType,
    runAsync: async (): Promise<GltfMeshCompressionOptions> => {
        const encoderPreparationPromise = import("@babylonjs/core/Meshes/Compression/dracoEncoder.js").then(async ({ DracoEncoder }) => {
            await prepareDefaultEncoderAsync(DracoEncoder);
        });
        const [, { RegisterKHR_draco_mesh_compression }] = await Promise.all([
            encoderPreparationPromise,
            import("@babylonjs/serializers/glTF/2.0/Extensions/KHR_draco_mesh_compression.pure.js"),
        ]);
        RegisterKHR_draco_mesh_compression();
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
    } catch (error) {
        if (defaultEncoderPreparationPromise === preparationPromise) {
            defaultEncoderPreparationPromise = undefined;
        }
        throw error;
    }

    if (!isBabylonDefaultConfiguration(DracoEncoder.DefaultConfiguration)) {
        return;
    }
    DracoEncoder.ResetDefault(true);
    DracoEncoder.DefaultConfiguration = configuration;
}

async function createDefaultEncoderConfigurationAsync(): Promise<IDracoCodecConfiguration> {
    if (isNode()) {
        const { createNodeDracoEncoderConfigurationAsync } = await import("../helpers/nodeDracoWorkerPool");
        return await createNodeDracoEncoderConfigurationAsync();
    }
    const { getDracoEncoderAssetUrls } = await import("../helpers/dracoEncoderAssets");
    const { wasmBinaryUrl, wasmWrapperUrl } = getDracoEncoderAssetUrls();
    return {
        wasmBinaryUrl,
        wasmUrl: wasmWrapperUrl,
    };
}

function isNode(): boolean {
    return typeof process === "object" && process.versions?.node !== undefined;
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
