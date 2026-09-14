import { STLFileLoaderMetadata } from "@babylonjs/loaders/STL/stlFileLoader.metadata.js";

import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { UrlType } from "../connectionPoints/url";
import { NullEngineResource } from "../resources/nullEngineResource";
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
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: (url, _config, { engine }) =>
        loadSingleFileSceneWithPluginAsync(url, engine, StlLoaderFactory, {
            pluginExtension: ".stl",
        }),
});

/** Loads an STL URL into a Babylon.js scene. */
export class StlInputBlock extends Block<typeof StlInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof StlInputBlockDefinition>) {
        super(StlInputBlockDefinition, options);
    }
}
