import { meshopt } from "@gltf-transform/functions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { MeshoptEncoderResource } from "../resources/meshoptEncoderResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const EncodeMeshoptBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.encode-meshopt",
    input: GltfDocumentType,
    output: GltfDocumentType,
    resources: {
        encoder: MeshoptEncoderResource,
        io: PlatformIOResource,
    },
    runAsync: async (document, _config, { encoder, io }) => {
        io.registerDependencies({ "meshopt.encoder": encoder });
        await document.transform(meshopt({ encoder }));
        return document;
    },
});

/** Applies Meshopt compression. */
export class EncodeMeshoptBlock extends Block<typeof EncodeMeshoptBlockDefinition> {
    public constructor(options?: BlockOptions<typeof EncodeMeshoptBlockDefinition>) {
        super(EncodeMeshoptBlockDefinition, options);
    }
}
