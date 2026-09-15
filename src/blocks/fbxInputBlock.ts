import { FBXFileLoaderMetadata } from "@babylonjs/loaders/FBX/fbxFileLoader.metadata.js";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { convertBabylonSceneToDocumentAsync } from "../helpers/convertBabylonSceneToDocument";
import { NullEngineResource } from "../resources/nullEngineResource";
import { PlatformIOResource } from "../resources/platformIOResource";
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
    output: GltfDocumentType,
    resources: {
        engine: NullEngineResource,
        io: PlatformIOResource,
    },
    runAsync: async (url, _config, { engine, io }) =>
        convertBabylonSceneToDocumentAsync(
            await loadSingleFileSceneWithPluginAsync(url, engine, FbxLoaderFactory, {
                pluginExtension: ".fbx",
            }),
            io
        ),
});

/** Loads an FBX URL. */
export class FbxInputBlock extends Block<typeof FbxInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof FbxInputBlockDefinition>) {
        super(FbxInputBlockDefinition, options);
    }
}
