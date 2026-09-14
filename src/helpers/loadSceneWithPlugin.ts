import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { LoadOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";

type SceneSource = string | ArrayBufferView;

interface SceneLoadPreparation {
    readonly source: SceneSource;
    readonly pluginExtension?: string;
    readonly pluginOptions?: LoadOptions["pluginOptions"];
}

type PrepareSceneLoadAsync = (response: Response, resolvedUrl: string, signal: AbortSignal) => Promise<SceneLoadPreparation>;

interface SingleFileSceneLoadOptions {
    readonly includeRootUrl?: boolean;
    readonly pluginExtension?: string;
    readonly pluginOptions?: LoadOptions["pluginOptions"];
    readonly prepareSceneLoadAsync?: PrepareSceneLoadAsync;
}

export async function loadSceneWithPluginAsync(source: SceneSource, engine: AbstractEngine, registerPlugin: () => void, options?: LoadOptions): Promise<Scene> {
    registerPlugin();
    const { LoadSceneAsync } = await import("@babylonjs/core/Loading/sceneLoader.js");
    return LoadSceneAsync(source, engine, options);
}

export async function loadSingleFileSceneWithPluginAsync(
    url: string,
    engine: AbstractEngine,
    registerPlugin: () => void,
    options: SingleFileSceneLoadOptions = {}
): Promise<Scene> {
    if (!isHttpUrl(url)) {
        if (options.pluginExtension === undefined && options.pluginOptions === undefined) {
            return loadSceneWithPluginAsync(url, engine, registerPlugin);
        }

        return loadSceneWithPluginAsync(url, engine, registerPlugin, {
            ...(options.pluginExtension === undefined ? {} : { pluginExtension: options.pluginExtension }),
            ...(options.pluginOptions === undefined ? {} : { pluginOptions: options.pluginOptions }),
        });
    }

    const abortController = new AbortController();
    try {
        const response = await fetchOrThrowAsync(url, abortController.signal);
        const resolvedUrl = response.url || url;
        const preparation =
            options.prepareSceneLoadAsync === undefined
                ? { source: await responseToDataUriAsync(response) }
                : await options.prepareSceneLoadAsync(response, resolvedUrl, abortController.signal);
        const loadOptions: LoadOptions = {
            name: new URL(resolvedUrl).pathname.split("/").pop() ?? "",
        };
        if (options.includeRootUrl !== false) {
            loadOptions.rootUrl = new URL(".", resolvedUrl).href;
        }
        const resolvedPluginExtension = preparation.pluginExtension ?? options.pluginExtension;
        if (resolvedPluginExtension !== undefined) {
            loadOptions.pluginExtension = resolvedPluginExtension;
        }
        const resolvedPluginOptions = preparation.pluginOptions ?? options.pluginOptions;
        if (resolvedPluginOptions !== undefined) {
            loadOptions.pluginOptions = resolvedPluginOptions;
        }
        return await loadSceneWithPluginAsync(preparation.source, engine, registerPlugin, loadOptions);
    } finally {
        abortController.abort();
    }
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
