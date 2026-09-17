import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { resolveInputLocationAsync } from "../helpers/inputLocation";
import { GltfDecoderResource } from "../resources/gltfDecoderResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const GltfInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.gltf",
    input: UrlType,
    output: GltfDocumentType,
    resources: {
        decoders: GltfDecoderResource,
        io: PlatformIOResource,
    },
    runAsync: async (url, _config, { decoders, io }) => {
        const location = await resolveInputLocationAsync(url);
        const document = await io
            .registerExtensions(ALL_EXTENSIONS)
            .registerDependencies(decoders)
            .read(location.path ?? location.uri);
        document.disposeExtension("KHR_draco_mesh_compression");
        document.disposeExtension("EXT_meshopt_compression");
        return document;
    },
});

/** Loads a glTF or GLB URI or Node filesystem path. */
export class GltfInputBlock extends Block<typeof GltfInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof GltfInputBlockDefinition>) {
        super(GltfInputBlockDefinition, options);
    }
}
