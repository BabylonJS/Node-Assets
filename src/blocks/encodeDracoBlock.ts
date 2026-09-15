import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { draco } from "@gltf-transform/functions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { DracoEncoderResource } from "../resources/dracoEncoderResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const EncodeDracoBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.encode-draco",
    input: GltfDocumentType,
    output: GltfDocumentType,
    resources: {
        encoder: DracoEncoderResource,
        io: PlatformIOResource,
    },
    runAsync: async (document, _config, { encoder, io }) => {
        io.registerExtensions([KHRDracoMeshCompression]).registerDependencies({ "draco3d.encoder": encoder });
        await document.transform(draco());
        return document;
    },
});

/** Applies Draco compression. */
export class EncodeDracoBlock extends Block<typeof EncodeDracoBlockDefinition> {
    public constructor(options?: BlockOptions<typeof EncodeDracoBlockDefinition>) {
        super(EncodeDracoBlockDefinition, options);
    }
}
