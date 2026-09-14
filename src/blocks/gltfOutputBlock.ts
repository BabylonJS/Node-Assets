import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";

import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { FileType } from "../connectionPoints/file";
import { GltfMeshCompressionOptionsType, type GltfMeshCompressionOptions } from "../connectionPoints/gltfMeshCompressionOptions";
import { Block, type BlockOptions, type InputPort } from "./block";
import { defineBlock } from "./blockDefinition";

const GltfOutputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "output.gltf",
    input: BabylonSceneType,
    auxiliaryInputs: {
        geometryCompressionOptions: GltfMeshCompressionOptionsType,
    },
    output: FileType,
    runAsync: (scene, _config, _resources, { geometryCompressionOptions }) => serializeGlbAsync(scene, geometryCompressionOptions),
});

/** Options for naming the block or supplying its initial scene input. */
export type GltfOutputBlockOptions = BlockOptions<typeof GltfOutputBlockDefinition>;

/** Serializes a Babylon.js scene to a binary glTF file. */
export class GltfOutputBlock extends Block<typeof GltfOutputBlockDefinition> {
    public readonly geometryCompressionOptions: InputPort<typeof GltfMeshCompressionOptionsType>;

    public constructor(options?: GltfOutputBlockOptions) {
        super(GltfOutputBlockDefinition, options);
        this.geometryCompressionOptions = this.auxiliaryInputs.geometryCompressionOptions;
    }
}

async function serializeGlbAsync(scene: BabylonScene, geometryCompressionOptions: GltfMeshCompressionOptions | undefined): Promise<File> {
    const { GLTF2Export } = await import("@babylonjs/serializers/glTF/2.0/index.js");
    const fileName = "scene.glb";
    const result = await GLTF2Export.GLBAsync(scene, fileName, geometryCompressionOptions);
    const root = result.files[fileName];
    if (!(root instanceof Blob)) {
        throw new Error(`The Babylon glTF serializer did not produce "${fileName}".`);
    }
    return new File([root], fileName, { type: "model/gltf-binary", lastModified: 0 });
}
