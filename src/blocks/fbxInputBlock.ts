import { RegisterSceneLoaderPlugin, type ISceneLoaderPluginFactory, type SceneLoaderPluginOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import { FBXFileLoaderMetadata } from "@babylonjs/loaders/FBX/fbxFileLoader.metadata.js";

import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { UrlType } from "../connectionPoints/url";
import { NullEngineResource } from "../resources/nullEngineResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";
import { loadSingleFileSceneWithPluginAsync } from "../helpers/loadSceneWithPlugin";

const FbxInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.fbx",
    input: UrlType,
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: (url, _config, { engine }) => loadSingleFileSceneWithPluginAsync(url, engine, registerFbxLoader, { pluginExtension: ".fbx" }),
});

/** Loads an FBX URL into a Babylon.js scene. */
export class FbxInputBlock extends Block<typeof FbxInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof FbxInputBlockDefinition>) {
        super(FbxInputBlockDefinition, options);
    }
}

function registerFbxLoader(): void {
    RegisterSceneLoaderPlugin({
        ...FBXFileLoaderMetadata,
        createPlugin: async (options: SceneLoaderPluginOptions) => {
            const [{ RegisterStandardMaterial }, { FBXFileLoader }] = await Promise.all([
                import("@babylonjs/core/Materials/standardMaterial.pure.js"),
                import("@babylonjs/loaders/FBX/fbxFileLoader.pure.js"),
            ]);
            RegisterStandardMaterial();
            return new FBXFileLoader(options[FBXFileLoaderMetadata.name]);
        },
    } satisfies ISceneLoaderPluginFactory);
}
