import type { ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { OBJFileLoaderMetadata } from "@babylonjs/loaders/OBJ/objFileLoader.metadata.js";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { convertBabylonSceneToDocumentAsync } from "../helpers/convertBabylonSceneToDocument";
import { loadSceneWithPluginAsync } from "../helpers/loadSceneWithPlugin";
import { NullEngineResource } from "../resources/nullEngineResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const ObjLoaderFactory = {
    ...OBJFileLoaderMetadata,
    createPlugin: async (options) => {
        const { OBJFileLoader } = await import("@babylonjs/loaders/OBJ/objFileLoader.pure.js");
        return new OBJFileLoader(options.obj);
    },
} satisfies ISceneLoaderPluginFactory;

const ObjInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.obj",
    input: UrlType,
    output: GltfDocumentType,
    resources: {
        engine: NullEngineResource,
        io: PlatformIOResource,
    },
    runAsync: async (url, _config, { engine, io }) =>
        convertBabylonSceneToDocumentAsync(
            await loadSceneWithPluginAsync(url, engine, ObjLoaderFactory, {
                pluginExtension: ".obj",
                pluginOptions: { obj: { materialLoadingFailsSilently: false } },
            }),
            io
        ),
});

/** Loads an OBJ URL or Node filesystem path using Babylon's dependency resolution. */
export class ObjInputBlock extends Block<typeof ObjInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof ObjInputBlockDefinition>) {
        super(ObjInputBlockDefinition, options);
    }
}
