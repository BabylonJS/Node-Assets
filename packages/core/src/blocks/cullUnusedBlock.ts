import { prune } from "@gltf-transform/functions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const CullUnusedBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.cull-unused",
    input: GltfDocumentType,
    output: GltfDocumentType,
    runAsync: async (document) => {
        await document.transform(prune());
        return document;
    },
});

/** Removes unused document resources with library-default behavior. */
export class CullUnusedBlock extends Block<typeof CullUnusedBlockDefinition> {
    public constructor(options?: BlockOptions<typeof CullUnusedBlockDefinition>) {
        super(CullUnusedBlockDefinition, options);
    }
}
