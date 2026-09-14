import { RegisterSceneLoaderPlugin, type ISceneLoaderPluginFactory, type SceneLoaderPluginOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import { OBJFileLoaderMetadata } from "@babylonjs/loaders/OBJ/objFileLoader.metadata.js";

export function registerObjLoader(): void {
    RegisterSceneLoaderPlugin({
        ...OBJFileLoaderMetadata,
        createPlugin: async (options: SceneLoaderPluginOptions) => {
            const { OBJFileLoader } = await import("@babylonjs/loaders/OBJ/objFileLoader.pure.js");
            return new OBJFileLoader(options[OBJFileLoaderMetadata.name]);
        },
    } satisfies ISceneLoaderPluginFactory);
}
