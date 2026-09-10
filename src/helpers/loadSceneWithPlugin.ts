import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { LoadOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";

type SceneSource = string | ArrayBufferView;

export async function loadSceneWithPluginAsync(source: SceneSource, engine: AbstractEngine, loadPluginAsync: () => Promise<unknown>, options?: LoadOptions): Promise<Scene> {
    const [{ LoadSceneAsync }] = await Promise.all([import("@babylonjs/core/Loading/sceneLoader.js"), loadPluginAsync()]);
    return LoadSceneAsync(source, engine, options);
}

export async function loadSingleFileSceneWithPluginAsync(url: string, engine: AbstractEngine, pluginExtension: string, loadPluginAsync: () => Promise<unknown>): Promise<Scene> {
    if (!isHttpUrl(url)) {
        return loadSceneWithPluginAsync(url, engine, loadPluginAsync, { pluginExtension });
    }

    const abortController = new AbortController();
    try {
        const fetched = await fetchAsDataUriWithUrlAsync(url, abortController.signal);
        return await loadSceneWithPluginAsync(fetched.dataUri, engine, loadPluginAsync, {
            rootUrl: new URL(".", fetched.url).href,
            pluginExtension,
            name: new URL(fetched.url).pathname.split("/").pop() ?? "",
        });
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

export async function fetchAsDataUriAsync(url: string, signal: AbortSignal): Promise<string> {
    return (await fetchAsDataUriWithUrlAsync(url, signal)).dataUri;
}

export async function fetchAsDataUriWithUrlAsync(url: string, signal: AbortSignal): Promise<{ readonly dataUri: string; readonly url: string }> {
    const response = await fetchOrThrowAsync(url, signal);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0] || "application/octet-stream";
    const dataUri = createDataUri(new Uint8Array(await response.arrayBuffer()), contentType);
    return { dataUri, url: response.url || url };
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
