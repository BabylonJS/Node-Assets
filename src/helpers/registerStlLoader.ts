import { RegisterSceneLoaderPlugin, type ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { STLFileLoaderMetadata } from "@babylonjs/loaders/STL/stlFileLoader.metadata.js";

export function registerStlLoader(): void {
    RegisterSceneLoaderPlugin({
        ...STLFileLoaderMetadata,
        createPlugin: async () => {
            const [{ RegisterStandardMaterial }, { STLFileLoader }] = await Promise.all([
                import("@babylonjs/core/Materials/standardMaterial.pure.js"),
                import("@babylonjs/loaders/STL/stlFileLoader.pure.js"),
            ]);
            RegisterStandardMaterial();
            return new STLFileLoader();
        },
    } satisfies ISceneLoaderPluginFactory);
}
