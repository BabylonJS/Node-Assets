import type { Document } from "@gltf-transform/core";

import { FileType } from "../connectionPoints/file";
import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const GltfOutputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "output.gltf",
    input: GltfDocumentType,
    output: FileType,
    resources: {
        io: PlatformIOResource,
    },
    runAsync: (document, _config, { io }) => serializeGlbAsync(document, io.writeBinary.bind(io)),
});

/** Options for naming the block or supplying its initial input. */
export type GltfOutputBlockOptions = BlockOptions<typeof GltfOutputBlockDefinition>;

/** Serializes its input to a binary glTF file. */
export class GltfOutputBlock extends Block<typeof GltfOutputBlockDefinition> {
    public constructor(options?: GltfOutputBlockOptions) {
        super(GltfOutputBlockDefinition, options);
    }
}

async function serializeGlbAsync(document: Document, writeBinaryAsync: (document: Document) => Promise<Uint8Array<ArrayBuffer>>): Promise<File> {
    const fileName = "scene.glb";
    const data = await writeBinaryAsync(document);
    return new File([data], fileName, { type: "model/gltf-binary", lastModified: 0 });
}
