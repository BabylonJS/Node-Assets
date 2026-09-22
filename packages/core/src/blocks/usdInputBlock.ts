import type { ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { USDFileLoaderMetadata } from "@babylonjs/loaders/USD/usdFileLoader.metadata.js";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { convertBabylonSceneToDocumentAsync } from "../helpers/convertBabylonSceneToDocument";
import { loadSceneWithPluginAsync } from "../helpers/loadSceneWithPlugin";
import { NullEngineResource } from "../resources/nullEngineResource";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const UsdLoaderFactory = {
    ...USDFileLoaderMetadata,
    createPlugin: async () => {
        const [{ USDFileLoader, _RegisterUSDLoaderDependencies }, { default: runtimeUrls }] = await Promise.all([
            import("@babylonjs/loaders/USD/usdFileLoader.pure.js"),
            import("virtual:node-assets-usd-runtime-urls"),
        ]);
        _RegisterUSDLoaderDependencies();
        return new USDFileLoader(runtimeUrls);
    },
} satisfies ISceneLoaderPluginFactory;

const UsdInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.usd",
    input: UrlType,
    output: GltfDocumentType,
    resources: {
        engine: NullEngineResource,
        io: PlatformIOResource,
    },
    runAsync: async (url, _config, { engine, io }) =>
        convertBabylonSceneToDocumentAsync(
            await loadSceneWithPluginAsync(url, engine, UsdLoaderFactory, {
                pluginExtension: ".usd",
            }),
            io
        ),
});

/** Loads a USD, USDA, USDC, or USDZ URL or Node filesystem path; requires Web Worker support. */
export class UsdInputBlock extends Block<typeof UsdInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof UsdInputBlockDefinition>) {
        super(UsdInputBlockDefinition, options);
    }
}
