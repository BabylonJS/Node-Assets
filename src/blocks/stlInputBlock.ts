import { STLFileLoaderMetadata } from "@babylonjs/loaders/STL/stlFileLoader.metadata.js";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { convertBabylonSceneToDocumentAsync } from "../helpers/convertBabylonSceneToDocument";
import { NullEngineResource } from "../resources/nullEngineResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";
import { loadSingleFileSceneWithPluginAsync, type SceneLoaderPluginFactory } from "../helpers/loadSceneWithPlugin";

const StlLoaderFactory = {
    ...STLFileLoaderMetadata,
    createPlugin: async () => {
        const [{ RegisterStandardMaterial }, { STLFileLoader }] = await Promise.all([
            import("@babylonjs/core/Materials/standardMaterial.pure.js"),
            import("@babylonjs/loaders/STL/stlFileLoader.pure.js"),
        ]);
        RegisterStandardMaterial();
        return new STLFileLoader();
    },
} satisfies SceneLoaderPluginFactory;

const StlInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.stl",
    input: UrlType,
    output: GltfDocumentType,
    resources: {
        engine: NullEngineResource,
        io: PlatformIOResource,
    },
    runAsync: async (url, _config, { engine, io }) =>
        convertBabylonSceneToDocumentAsync(
            await loadSingleFileSceneWithPluginAsync(url, engine, StlLoaderFactory, {
                pluginExtension: ".stl",
            }),
            io
        ),
});

/** Loads an STL URL. */
export class StlInputBlock extends Block<typeof StlInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof StlInputBlockDefinition>) {
        super(StlInputBlockDefinition, options);
    }
}
