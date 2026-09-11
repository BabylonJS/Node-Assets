import type { ISceneLoaderPluginFactory } from "@babylonjs/core/Loading/sceneLoader.js";
import { GLTFFileLoaderMetadata } from "@babylonjs/loaders/glTF/glTFFileLoader.metadata.js";

type GltfLoaderModules = Awaited<ReturnType<typeof importGltfLoaderModulesAsync>>;

let builtInExtensionRegistrations: ReadonlyMap<string, unknown> | undefined;
let gltfLoaderModulesPromise: Promise<GltfLoaderModules> | undefined;

const GltfLoaderPluginFactory = {
    ...GLTFFileLoaderMetadata,
    async createPlugin(options) {
        const { GLTFFileLoader, RegisterGLTF2Loader, RegisterInstancedMesh, registerBuiltInGLTFExtensions, registeredGLTFExtensions } = await loadGltfLoaderModulesAsync();
        RegisterInstancedMesh();
        RegisterGLTF2Loader();
        ensureBuiltInExtensionsRegistered(registeredGLTFExtensions, registerBuiltInGLTFExtensions);
        return new GLTFFileLoader(options[GLTFFileLoaderMetadata.name]);
    },
} satisfies ISceneLoaderPluginFactory;

export async function registerGltfLoaderAsync(): Promise<void> {
    const [{ RegisterSceneLoaderPlugin }] = await Promise.all([import("@babylonjs/core/Loading/sceneLoader.js"), loadGltfLoaderModulesAsync()]);
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
    return import("./gltfLoaderImplementation");
}

function ensureBuiltInExtensionsRegistered(
    registeredExtensions: GltfLoaderModules["registeredGLTFExtensions"],
    registerBuiltInExtensions: GltfLoaderModules["registerBuiltInGLTFExtensions"]
): void {
    if (builtInExtensionRegistrations !== undefined && Array.from(builtInExtensionRegistrations).every(([name, registration]) => registeredExtensions.get(name) === registration)) {
        return;
    }

    const previousRegistrations = new Map(registeredExtensions);
    registerBuiltInExtensions();
    builtInExtensionRegistrations = new Map(Array.from(registeredExtensions).filter(([name, registration]) => previousRegistrations.get(name) !== registration));
}
