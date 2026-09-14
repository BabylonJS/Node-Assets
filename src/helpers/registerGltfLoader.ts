import { RegisterSceneLoaderPlugin, type ISceneLoaderPluginFactory, type SceneLoaderPluginOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import { registerBuiltInGLTFExtensions } from "@babylonjs/loaders/glTF/2.0/Extensions/dynamic.js";
import { GLTFFileLoaderMetadata } from "@babylonjs/loaders/glTF/glTFFileLoader.metadata.js";

export function registerGltfLoader(): void {
    RegisterSceneLoaderPlugin({
        ...GLTFFileLoaderMetadata,
        createPlugin: async (options: SceneLoaderPluginOptions) => {
            const [{ GLTFFileLoader, RegisterGLTF2Loader }, { RegisterInstancedMesh }] = await Promise.all([
                import("@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js"),
                import("@babylonjs/core/Meshes/instancedMesh.pure.js"),
            ]);
            RegisterInstancedMesh();
            RegisterGLTF2Loader();
            return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
        },
    } satisfies ISceneLoaderPluginFactory);

    registerBuiltInGLTFExtensions();
}
