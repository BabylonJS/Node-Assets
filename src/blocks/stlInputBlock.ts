import { BabylonSceneType } from "../connectionPoints/babylonScene";
import { UrlType } from "../connectionPoints/url";
import { NullEngineResource } from "../resources/nullEngineResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";
import { loadSingleFileSceneWithPluginAsync } from "../helpers/loadSceneWithPlugin";

const StlInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.stl",
    input: UrlType,
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: (url, _config, { engine }) => loadSingleFileSceneWithPluginAsync(url, engine, () => import("@babylonjs/loaders/STL/index.js"), { pluginExtension: ".stl" }),
});

/** Loads an STL URL into a Babylon.js scene. */
export class StlInputBlock extends Block<typeof StlInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof StlInputBlockDefinition>) {
        super(StlInputBlockDefinition, options);
    }
}
