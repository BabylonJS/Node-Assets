import { Block, type BlockOptions } from "../block/block";
import { defineBlock } from "../block/blockDefinition";
import { BabylonSceneType, UrlType } from "../block/connectionPointType";
import { NullEngineResource } from "../resources/nullEngineResource";
import { fetchOrThrowAsync, isHttpUrl, loadSingleFileSceneWithPluginAsync, responseToDataUriAsync } from "../helpers/loadSceneWithPlugin";

const GltfInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.gltf",
    input: UrlType,
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: (url, _config, { engine }) =>
        loadSingleFileSceneWithPluginAsync(
            url,
            engine,
            undefined,
            () => import("@babylonjs/loaders/glTF/index.js"),
            async (response, resolvedUrl, signal) => {
                const format = await readGltfResponseAsync(response, resolvedUrl);
                return {
                    source: format.source,
                    pluginExtension: format.extension,
                    pluginOptions: {
                        gltf: {
                            preprocessUrlAsync: async (dependencyUrl) => {
                                if (!isHttpUrl(dependencyUrl)) {
                                    return dependencyUrl;
                                }

                                return responseToDataUriAsync(await fetchOrThrowAsync(dependencyUrl, signal));
                            },
                        },
                    },
                };
            }
        ),
});

/** Loads a glTF or GLB URL into a Babylon.js scene. */
export class GltfInputBlock extends Block<typeof GltfInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof GltfInputBlockDefinition>) {
        super(GltfInputBlockDefinition, options);
    }
}

interface GltfResponse {
    readonly extension: ".gltf" | ".glb";
    readonly source: string | Uint8Array;
}

async function readGltfResponseAsync(response: Response, url: string): Promise<GltfResponse> {
    const extension = tryGetGltfExtension(url) ?? getGltfExtensionFromContentType(response.headers.get("content-type"));
    if (extension === ".glb") {
        return { extension, source: new Uint8Array(await response.arrayBuffer()) };
    }
    if (extension === ".gltf") {
        return { extension, source: `data:${await response.text()}` };
    }

    const data = new Uint8Array(await response.arrayBuffer());
    if (isGlb(data)) {
        return { extension: ".glb", source: data };
    }
    const json = new TextDecoder().decode(data);
    if (isGltfJson(json)) {
        return { extension: ".gltf", source: `data:${json}` };
    }
    throw new Error(`Unable to determine the glTF format from "${url}".`);
}

function tryGetGltfExtension(url: string): ".gltf" | ".glb" | undefined {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".glb")) {
        return ".glb";
    }
    if (pathname.endsWith(".gltf")) {
        return ".gltf";
    }
    return undefined;
}

function getGltfExtensionFromContentType(contentType: string | null): ".gltf" | ".glb" | undefined {
    switch (contentType?.split(";", 1)[0]?.trim().toLowerCase()) {
        case "model/gltf-binary":
            return ".glb";
        case "model/gltf+json":
        case "application/json":
            return ".gltf";
        default:
            return undefined;
    }
}

function isGlb(data: Uint8Array): boolean {
    return data.byteLength >= 4 && data[0] === 0x67 && data[1] === 0x6c && data[2] === 0x54 && data[3] === 0x46;
}

function isGltfJson(json: string): boolean {
    try {
        const parsed = JSON.parse(json) as { asset?: { version?: unknown } };
        return typeof parsed.asset?.version === "string";
    } catch {
        return false;
    }
}
