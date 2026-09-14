import { RegisterSceneLoaderPlugin, type ISceneLoaderPluginFactory, type SceneLoaderPluginOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import { FBXFileLoaderMetadata } from "@babylonjs/loaders/FBX/fbxFileLoader.metadata.js";

export function registerFbxLoader(): void {
    RegisterSceneLoaderPlugin({
        ...FBXFileLoaderMetadata,
        createPlugin: async (options: SceneLoaderPluginOptions) => {
            const { FBXFileLoader } = await import("@babylonjs/loaders/FBX/fbxFileLoader.pure.js");
            return new FBXFileLoader(options[FBXFileLoaderMetadata.name]);
        },
    } satisfies ISceneLoaderPluginFactory);
}
