import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { UrlType } from "../connectionPoints/url";
import { NullEngineResource } from "../resources/nullEngineResource";
import { registerFbxLoader } from "../helpers/registerFbxLoader";
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
