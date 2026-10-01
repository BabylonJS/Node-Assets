import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { quantize } from "@gltf-transform/functions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const QuantizeBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.quantize",
    input: GltfDocumentType,
    output: GltfDocumentType,
    resources: {
        io: PlatformIOResource,
    },
    runAsync: async (document, _config, { io }) => {
        io.registerExtensions([KHRMeshQuantization]);
        await document.transform(quantize());
        return document;
    },
});

/** Quantizes mesh attributes with library-default tuning. */
export class QuantizeBlock extends Block<typeof QuantizeBlockDefinition> {
    public constructor(options?: BlockOptions<typeof QuantizeBlockDefinition>) {
        super(QuantizeBlockDefinition, options);
    }
}
