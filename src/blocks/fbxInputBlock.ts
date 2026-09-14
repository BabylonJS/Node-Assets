import { FBXFileLoaderMetadata } from "@babylonjs/loaders/FBX/fbxFileLoader.metadata.js";

import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { UrlType } from "../connectionPoints/url";
import { NullEngineResource } from "../resources/nullEngineResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";
import { loadSingleFileSceneWithPluginAsync, type SceneLoaderPluginFactory } from "../helpers/loadSceneWithPlugin";

const FbxLoaderFactory = {
    ...FBXFileLoaderMetadata,
    createPlugin: async () => {
        const [{ RegisterStandardMaterial }, { FBXFileLoader }] = await Promise.all([
            import("@babylonjs/core/Materials/standardMaterial.pure.js"),
            import("@babylonjs/loaders/FBX/fbxFileLoader.pure.js"),
        ]);
        RegisterStandardMaterial();
        return new FBXFileLoader();
    },
} satisfies SceneLoaderPluginFactory;

const FbxInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.fbx",
    input: UrlType,
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: (url, _config, { engine }) =>
        loadSingleFileSceneWithPluginAsync(url, engine, FbxLoaderFactory, {
            pluginExtension: ".fbx",
        }),
});

/** Loads an FBX URL into a Babylon.js scene. */
export class FbxInputBlock extends Block<typeof FbxInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof FbxInputBlockDefinition>) {
        super(FbxInputBlockDefinition, options);
    }
}
