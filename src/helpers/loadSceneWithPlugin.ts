import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { ISceneLoaderPlugin, ISceneLoaderPluginAsync, ISceneLoaderPluginFactory, LoadOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";

type SceneSource = string | ArrayBufferView;

interface SceneLoadPreparation {
    readonly source: SceneSource;
    readonly pluginExtension?: string;
    readonly pluginOptions?: LoadOptions["pluginOptions"];
}

type PrepareSceneLoadAsync = (response: Response, resolvedUrl: string, signal: AbortSignal) => Promise<SceneLoadPreparation>;
type SceneLoaderPlugin = ISceneLoaderPlugin | ISceneLoaderPluginAsync;
export type SceneLoaderPluginFactory = Omit<ISceneLoaderPluginFactory, "createPlugin"> & {
    createPlugin(): SceneLoaderPlugin | Promise<SceneLoaderPlugin>;
};
type PluginRegistration = (() => void) | SceneLoaderPluginFactory;

interface SingleFileSceneLoadOptions {
    readonly includeRootUrl?: boolean;
    readonly pluginExtension?: string;
    readonly pluginOptions?: LoadOptions["pluginOptions"];
    readonly prepareSceneLoadAsync?: PrepareSceneLoadAsync;
}

export async function loadSceneWithPluginAsync(source: SceneSource, engine: AbstractEngine, pluginRegistration: PluginRegistration, options?: LoadOptions): Promise<Scene> {
    const { LoadSceneAsync, RegisterSceneLoaderPlugin } = await import("@babylonjs/core/Loading/sceneLoader.js");
    if (typeof pluginRegistration === "function") {
        pluginRegistration();
    } else {
        RegisterSceneLoaderPlugin(pluginRegistration);
    }
    return LoadSceneAsync(source, engine, options);
}

export async function loadSingleFileSceneWithPluginAsync(
    url: string,
    engine: AbstractEngine,
    pluginRegistration: PluginRegistration,
    options: SingleFileSceneLoadOptions = {}
): Promise<Scene> {
    if (!isHttpUrl(url)) {
        if (options.pluginExtension === undefined && options.pluginOptions === undefined) {
            return loadSceneWithPluginAsync(url, engine, pluginRegistration);
        }

        return loadSceneWithPluginAsync(url, engine, pluginRegistration, {
            ...(options.pluginExtension === undefined ? {} : { pluginExtension: options.pluginExtension }),
            ...(options.pluginOptions === undefined ? {} : { pluginOptions: options.pluginOptions }),
        });
    }

    const abortController = new AbortController();
    try {
        const response = await fetchOrThrowAsync(url, abortController.signal);
        const resolvedUrl = response.url || url;
        const rootUrl = new URL(".", resolvedUrl).href;
        const name = new URL(resolvedUrl).pathname.split("/").pop() ?? "";
        if (options.prepareSceneLoadAsync === undefined && typeof pluginRegistration !== "function") {
            const [data, plugin] = await Promise.all([response.arrayBuffer(), pluginRegistration.createPlugin()]);
            return await loadFetchedSceneWithPluginAsync(data, engine, rootUrl, name, plugin);
        }
        const preparation =
            options.prepareSceneLoadAsync === undefined
                ? { source: await responseToDataUriAsync(response) }
                : await options.prepareSceneLoadAsync(response, resolvedUrl, abortController.signal);
        const loadOptions: LoadOptions = {
            name,
        };
        if (options.includeRootUrl !== false) {
            loadOptions.rootUrl = rootUrl;
        }
        const resolvedPluginExtension = preparation.pluginExtension ?? options.pluginExtension;
        if (resolvedPluginExtension !== undefined) {
            loadOptions.pluginExtension = resolvedPluginExtension;
        }
        const resolvedPluginOptions = preparation.pluginOptions ?? options.pluginOptions;
        if (resolvedPluginOptions !== undefined) {
            loadOptions.pluginOptions = resolvedPluginOptions;
        }
        return await loadSceneWithPluginAsync(preparation.source, engine, pluginRegistration, loadOptions);
    } finally {
        abortController.abort();
    }
}

async function loadFetchedSceneWithPluginAsync(data: ArrayBuffer, engine: AbstractEngine, rootUrl: string, name: string, plugin: SceneLoaderPlugin): Promise<Scene> {
    const { Scene } = await import("@babylonjs/core/scene.pure.js");
    const scene = new Scene(engine);

    try {
        const loadingToken = {};
        scene.addPendingData(loadingToken);
        try {
            if (isAsyncSceneLoaderPlugin(plugin)) {
                await plugin.loadAsync(scene, data, rootUrl, undefined, name);
            } else {
                let pluginError: { readonly exception?: unknown; readonly message: string } | undefined;
                const loaded = plugin.load(scene, data, rootUrl, (message, exception) => {
                    pluginError = { exception, message };
                });
                if (!loaded) {
                    throw pluginError?.exception ?? new Error(pluginError?.message ?? `The ${plugin.name} loader failed.`);
                }
            }
            scene.loadingPluginName = plugin.name;
        } finally {
            scene.removePendingData(loadingToken);
        }
        return scene;
    } catch (error) {
        scene.dispose();
        throw error;
    }
}

function isAsyncSceneLoaderPlugin(plugin: SceneLoaderPlugin): plugin is ISceneLoaderPluginAsync {
    return "loadAsync" in plugin;
}

export function isHttpUrl(url: string): boolean {
    const scheme = url.slice(0, 8).toLowerCase();
    return scheme.startsWith("http://") || scheme.startsWith("https://");
}

export async function fetchOrThrowAsync(url: string, signal: AbortSignal): Promise<Response> {
    const response = await fetch(url, { signal });
    if (!response.ok) {
        throw new Error(`Failed to fetch "${url}": HTTP ${response.status} ${response.statusText}`.trim());
    }
    return response;
}

export function createDataUri(data: Uint8Array, contentType: string): string {
    return `data:${contentType};base64,${toBase64(data)}`;
}

export function toBase64(data: Uint8Array): string {
    if (typeof Buffer === "function") {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
    }

    const chunkSize = 32_768;
    let binary = "";
    for (let offset = 0; offset < data.length; offset += chunkSize) {
        binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

export async function responseToDataUriAsync(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] || "application/octet-stream";
    const data = new Uint8Array(await response.arrayBuffer());
    return createDataUri(data, contentType);
}
