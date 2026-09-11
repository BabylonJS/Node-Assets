import type { ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { GLTFFileLoaderMetadata } from "@babylonjs/loaders/glTF/glTFFileLoader.metadata.js";

type GltfLoaderModules = Awaited<ReturnType<typeof importGltfLoaderModulesAsync>>;

let builtInExtensionRegistrations: ReadonlyMap<string, unknown> | undefined;
let gltfLoaderModulesPromise: Promise<GltfLoaderModules> | undefined;

const GltfLoaderPluginFactory = {
    ...GLTFFileLoaderMetadata,
    async createPlugin(options) {
        const [{ GLTFFileLoader, RegisterGLTF2Loader }, { registerBuiltInGLTFExtensions }, { registeredGLTFExtensions }, { RegisterInstancedMesh }] =
            await loadGltfLoaderModulesAsync();
        RegisterInstancedMesh();
        RegisterGLTF2Loader();
        ensureBuiltInExtensionsRegistered(registeredGLTFExtensions, registerBuiltInGLTFExtensions);
        return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
    },
} satisfies ISceneLoaderPluginFactory;

export async function registerGltfLoaderAsync(): Promise<void> {
    const { RegisterSceneLoaderPlugin } = await import("@babylonjs/core/Loading/sceneLoader.js");
    RegisterSceneLoaderPlugin(GltfLoaderPluginFactory);
}

function loadGltfLoaderModulesAsync(): Promise<GltfLoaderModules> {
    if (gltfLoaderModulesPromise === undefined) {
        const promise = importGltfLoaderModulesAsync();
        gltfLoaderModulesPromise = promise;
        void promise.catch(() => {
            if (gltfLoaderModulesPromise === promise) {
                gltfLoaderModulesPromise = undefined;
            }
        });
    }
    return gltfLoaderModulesPromise;
}

function importGltfLoaderModulesAsync() {
    return Promise.all([
        import("@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js"),
        import("@babylonjs/loaders/glTF/2.0/Extensions/dynamic.js"),
        import("@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry.js"),
        import("@babylonjs/core/Meshes/instancedMesh.pure.js"),
    ] as const);
}

function ensureBuiltInExtensionsRegistered(
    registeredExtensions: GltfLoaderModules[2]["registeredGLTFExtensions"],
    registerBuiltInExtensions: GltfLoaderModules[1]["registerBuiltInGLTFExtensions"]
): void {
    if (builtInExtensionRegistrations !== undefined && Array.from(builtInExtensionRegistrations).every(([name, registration]) => registeredExtensions.get(name) === registration)) {
        return;
    }

    const previousRegistrations = new Map(registeredExtensions);
    registerBuiltInExtensions();
    builtInExtensionRegistrations = new Map(Array.from(registeredExtensions).filter(([name, registration]) => previousRegistrations.get(name) !== registration));
}
