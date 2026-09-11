import type { ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { GLTFFileLoaderMetadata } from "@babylonjs/loaders/glTF/glTFFileLoader.metadata.js";

const GltfLoaderPluginFactory = {
    ...GLTFFileLoaderMetadata,
    async createPlugin(options) {
        const [{ GLTFFileLoader, RegisterGLTF2Loader }, { registerBuiltInGLTFExtensions }] = await Promise.all([
            import("@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js"),
            import("@babylonjs/loaders/glTF/2.0/Extensions/dynamic.js"),
            import("@babylonjs/core/Meshes/instancedMesh.js"),
        ]);
        RegisterGLTF2Loader();
        registerBuiltInGLTFExtensions();
        return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
    },
} satisfies ISceneLoaderPluginFactory;

export async function registerGltfLoaderAsync(): Promise<void> {
    const { RegisterSceneLoaderPlugin } = await import("@babylonjs/core/Loading/sceneLoader.js");
    RegisterSceneLoaderPlugin(GltfLoaderPluginFactory);
}
