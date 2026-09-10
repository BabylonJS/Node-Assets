import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";

import { Block, type BlockOptions } from "../block/block";
import { defineBlock } from "../block/blockDefinition";
import { BabylonSceneType, UrlType } from "../block/connectionPointType";
import { createDataUri, fetchOrThrowAsync, isHttpUrl, loadSceneWithPluginAsync } from "../helpers/loadSceneWithPlugin";
import { NullEngineResource } from "../resources/nullEngineResource";

const MaximumConcurrentTextureFetches = 8;

const ObjInputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "input.obj",
    input: UrlType,
    output: BabylonSceneType,
    resources: {
        engine: NullEngineResource,
    },
    runAsync: async (url, _config, { engine }) => {
        const pluginPromise = import("@babylonjs/loaders/OBJ/index.js");
        if (!isHttpUrl(url)) {
            return loadSceneWithPluginAsync(url, engine, () => pluginPromise, createObjLoadOptions());
        }

        const abortController = new AbortController();
        try {
            const objResponse = await fetchOrThrowAsync(url, abortController.signal);
            const resolvedObjUrl = objResponse.url || url;
            const obj = await objResponse.text();
            const references = analyzeObjReferences(obj);

            let source = obj;
            let textureAssets = new Map<string, TextureAsset>();
            let materialTokens = new Map<string, string>();
            if (references.mtl?.value) {
                const mtlUrl = resolveDependencyUrl(references.mtl.value, resolvedObjUrl, "MTL");
                const mtlResponse = await fetchOrThrowAsync(mtlUrl, abortController.signal);
                const resolvedMtlUrl = mtlResponse.url || mtlUrl;
                const mtl = await mtlResponse.text();
                const rewritten = await rewriteMtlAsync(mtl, resolvedMtlUrl, abortController.signal);
                textureAssets = rewritten.textureAssets;
                materialTokens = rewritten.materialTokens;
                source = rewriteObjReferences(obj, references, createTextDataUri(rewritten.source), materialTokens, resolvedObjUrl);
            } else if (references.mtl) {
                throw new Error(`Invalid OBJ file "${resolvedObjUrl}": mtllib has no material library path.`);
            }

            const scene = await loadSceneWithPluginAsync(createDirectTextSource(source), engine, () => pluginPromise, {
                ...createObjLoadOptions(),
                name: new URL(resolvedObjUrl).pathname.split("/").pop() ?? "",
            });
            await attachTextureDataAsync(scene, textureAssets);
            restoreMaterialNames(scene, materialTokens);
            return scene;
        } finally {
            abortController.abort();
        }
    },
});

/** Loads an OBJ URL and its HTTP(S) MTL and texture dependencies into a Babylon.js scene. */
export class ObjInputBlock extends Block<typeof ObjInputBlockDefinition> {
    public constructor(options?: BlockOptions<typeof ObjInputBlockDefinition>) {
        super(ObjInputBlockDefinition, options);
    }
}

function createObjLoadOptions() {
    return {
        pluginExtension: ".obj",
        pluginOptions: {
            obj: {
                materialLoadingFailsSilently: false,
            },
        },
    } as const;
}

interface ObjLineReference {
    readonly end: number;
    readonly indentation: string;
    readonly start: number;
    readonly value: string;
}

interface ObjReferences {
    readonly materials: readonly ObjLineReference[];
    readonly mtl?: ObjLineReference;
}

function analyzeObjReferences(obj: string): ObjReferences {
    let mtl: ObjLineReference | undefined;
    const materials: ObjLineReference[] = [];
    let start = 0;
    while (start <= obj.length) {
        const newline = obj.indexOf("\n", start);
        const lineEnd = newline === -1 ? obj.length : newline;
        const end = lineEnd > start && obj[lineEnd - 1] === "\r" ? lineEnd - 1 : lineEnd;
        const line = obj.slice(start, end);
        const withoutComment = line.replace(/#.*$/, "").trim();
        if (withoutComment === "mtllib" || withoutComment.startsWith("mtllib ")) {
            mtl = {
                end,
                indentation: line.match(/^\s*/)?.[0] ?? "",
                start,
                value: withoutComment.slice("mtllib".length).trim(),
            };
        } else if (withoutComment === "usemtl" || withoutComment.startsWith("usemtl ")) {
            materials.push({
                end,
                indentation: line.match(/^\s*/)?.[0] ?? "",
                start,
                value: withoutComment.slice("usemtl".length).trim(),
            });
        }
        if (newline === -1) {
            break;
        }
        start = newline + 1;
    }
    return { materials, ...(mtl === undefined ? {} : { mtl }) };
}

function rewriteObjReferences(obj: string, references: ObjReferences, mtlDataUri: string, materialTokens: ReadonlyMap<string, string>, objUrl: string): string {
    const replacements: Array<ObjLineReference & { readonly replacement: string }> = references.materials.flatMap((reference) => {
        if (reference.value.length === 0) {
            throw new Error(`Invalid OBJ file "${objUrl}": usemtl has no material name.`);
        }
        const token = materialTokens.get(reference.value);
        if (token === undefined) {
            return [];
        }
        return [{ ...reference, replacement: `${reference.indentation}usemtl ${token}` }];
    });
    if (references.mtl === undefined) {
        throw new Error(`Unable to rewrite the OBJ material library reference in "${objUrl}".`);
    }
    replacements.push({ ...references.mtl, replacement: `${references.mtl.indentation}mtllib ${mtlDataUri}` });

    let rewritten = obj;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        rewritten = `${rewritten.slice(0, replacement.start)}${replacement.replacement}${rewritten.slice(replacement.end)}`;
    }
    return rewritten;
}

interface RewrittenMtl {
    readonly materialTokens: Map<string, string>;
    readonly source: string;
    readonly textureAssets: Map<string, TextureAsset>;
}

async function rewriteMtlAsync(mtl: string, mtlUrl: string, signal: AbortSignal): Promise<RewrittenMtl> {
    const lines = mtl.split(/\r?\n/);
    const references: MtlTextureReference[] = [];
    const materialTokens = new Map<string, string>();
    let hasMaterial = false;

    for (const [lineIndex, line] of lines.entries()) {
        const parsedLine = parseMtlLine(line);
        if (parsedLine === undefined) {
            continue;
        }

        const { indentation, key, originalKey, value } = parsedLine;
        if (key === "newmtl") {
            if (value.length === 0) {
                throw new Error(`Invalid MTL file "${mtlUrl}": material name is empty.`);
            }
            hasMaterial = true;
            let token = materialTokens.get(value);
            if (token === undefined) {
                token = `node-assets-obj-material-${materialTokens.size}`;
                materialTokens.set(value, token);
            }
            lines[lineIndex] = `${indentation}${originalKey} ${token}`;
            continue;
        }
        if (!hasMaterial || !isTextureDirective(key)) {
            continue;
        }

        const texture = parseTextureReference(key, value, mtlUrl);
        const textureUrl = resolveDependencyUrl(texture.path, mtlUrl, "texture");
        references.push({ format: texture.format, indentation, lineIndex, originalKey, textureUrl });
    }

    if (!hasMaterial) {
        throw new Error(`Invalid MTL file "${mtlUrl}".`);
    }

    const textureAssets = await fetchTextureAssetsAsync(
        references.map(({ textureUrl }) => textureUrl),
        signal
    );
    for (const reference of references) {
        const replacement = reference.textureUrl.startsWith("data:") ? reference.textureUrl : textureAssets.get(reference.textureUrl)?.placeholder;
        if (replacement === undefined) {
            throw new Error(`Unable to rewrite texture "${reference.textureUrl}".`);
        }
        lines[reference.lineIndex] = `${reference.indentation}${reference.originalKey} ${reference.format(replacement)}`;
    }
    return {
        materialTokens,
        source: lines.join("\n"),
        textureAssets: new Map(Array.from(textureAssets.values(), (asset) => [asset.placeholder, asset])),
    };
}

interface ParsedMtlLine {
    readonly indentation: string;
    readonly key: string;
    readonly originalKey: string;
    readonly value: string;
}

function parseMtlLine(line: string): ParsedMtlLine | undefined {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
        return undefined;
    }

    const separatorIndex = trimmed.search(/\s/);
    const originalKey = separatorIndex === -1 ? trimmed : trimmed.slice(0, separatorIndex);
    return {
        indentation: line.match(/^\s*/)?.[0] ?? "",
        key: originalKey.toLowerCase(),
        originalKey,
        value: separatorIndex === -1 ? "" : trimmed.slice(separatorIndex).trim(),
    };
}

function isTextureDirective(key: string | undefined): key is "map_ka" | "map_kd" | "map_ks" | "map_bump" | "map_d" {
    return key === "map_ka" || key === "map_kd" || key === "map_ks" || key === "map_bump" || key === "map_d";
}

interface TextureReference {
    readonly path: string;
    readonly format: (dataUri: string) => string;
}

function parseTextureReference(key: string, value: string, mtlUrl: string): TextureReference {
    if (value.length === 0) {
        throw new Error(`Invalid MTL file "${mtlUrl}": ${key} has no texture path.`);
    }

    if (key !== "map_bump") {
        return { path: value, format: (dataUri) => dataUri };
    }

    const tokens = value.split(/\s+/);
    const bumpMultiplierIndex = tokens.indexOf("-bm");
    if (bumpMultiplierIndex < 0) {
        return { path: value, format: (dataUri) => dataUri };
    }
    const bumpMultiplier = tokens[bumpMultiplierIndex + 1];
    if (bumpMultiplier === undefined) {
        throw new Error(`Invalid MTL file "${mtlUrl}": map_bump has an incomplete -bm option.`);
    }

    const pathTokens = tokens.filter((_, index) => index !== bumpMultiplierIndex && index !== bumpMultiplierIndex + 1);
    const path = pathTokens.join(" ").trim();
    if (path.length === 0) {
        throw new Error(`Invalid MTL file "${mtlUrl}": map_bump has no texture path.`);
    }

    const option = `-bm ${bumpMultiplier}`;
    return {
        path,
        format: (dataUri) => (bumpMultiplierIndex === 0 ? `${option} ${dataUri}` : `${dataUri} ${option}`),
    };
}

interface MtlTextureReference {
    readonly format: (dataUri: string) => string;
    readonly indentation: string;
    readonly lineIndex: number;
    readonly originalKey: string;
    readonly textureUrl: string;
}

interface TextureAsset {
    readonly dataUri: string;
    readonly extension: string;
    readonly name: string;
    readonly placeholder: string;
}

async function fetchTextureAssetsAsync(textureUrls: readonly string[], signal: AbortSignal): Promise<Map<string, TextureAsset>> {
    const urls = Array.from(new Set(textureUrls.filter((url) => !url.startsWith("data:"))));
    const assets = new Map<string, TextureAsset>();
    let nextIndex = 0;

    const worker = async () => {
        while (nextIndex < urls.length) {
            signal.throwIfAborted();
            const index = nextIndex++;
            const url = urls[index];
            if (url === undefined) {
                return;
            }
            const response = await fetchOrThrowAsync(url, signal);
            const data = new Uint8Array(await response.arrayBuffer());
            const resolvedUrl = response.url || url;
            const format = detectTextureFormat(data, resolvedUrl);
            assets.set(url, {
                dataUri: createDataUri(data, format.contentType),
                extension: format.extension,
                name: resolvedUrl,
                placeholder: `data:${format.contentType},node-assets-obj-texture-${index}`,
            });
        }
    };

    await Promise.all(Array.from({ length: Math.min(MaximumConcurrentTextureFetches, urls.length) }, worker));
    return assets;
}

interface TextureFormat {
    readonly contentType: string;
    readonly extension: string;
}

function detectTextureFormat(data: Uint8Array, url: string): TextureFormat {
    if (
        data.length >= 20 &&
        startsWithBytes(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) &&
        hasBytesAt(data, 12, [0x49, 0x48, 0x44, 0x52]) &&
        hasBytesAt(data, data.length - 8, [0x49, 0x45, 0x4e, 0x44])
    ) {
        return { contentType: "image/png", extension: ".png" };
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9) {
        return { contentType: "image/jpeg", extension: ".jpg" };
    }
    if (
        data.length >= 12 &&
        startsWithBytes(data, [0x52, 0x49, 0x46, 0x46]) &&
        hasBytesAt(data, 8, [0x57, 0x45, 0x42, 0x50]) &&
        readUint32LittleEndian(data, 4) + 8 <= data.length
    ) {
        return { contentType: "image/webp", extension: ".webp" };
    }
    if (isAvif(data)) {
        return { contentType: "image/avif", extension: ".avif" };
    }
    if (data.length >= 68 && startsWithBytes(data, [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return { contentType: "image/ktx2", extension: ".ktx2" };
    }
    throw new Error(`Unsupported or invalid texture "${url}".`);
}

function isAvif(data: Uint8Array): boolean {
    if (data.length < 16 || !hasBytesAt(data, 4, [0x66, 0x74, 0x79, 0x70])) {
        return false;
    }
    const boxSize = readUint32BigEndian(data, 0);
    if (boxSize < 16 || boxSize > data.length) {
        return false;
    }
    if (isAvifBrand(data, 8)) {
        return true;
    }
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
        if (isAvifBrand(data, offset)) {
            return true;
        }
    }
    return false;
}

function isAvifBrand(data: Uint8Array, offset: number): boolean {
    return hasBytesAt(data, offset, [0x61, 0x76, 0x69, 0x66]) || hasBytesAt(data, offset, [0x61, 0x76, 0x69, 0x73]);
}

function readUint32BigEndian(data: Uint8Array, offset: number): number {
    return ((data[offset] ?? 0) * 0x1000000 + ((data[offset + 1] ?? 0) << 16) + ((data[offset + 2] ?? 0) << 8) + (data[offset + 3] ?? 0)) >>> 0;
}

function readUint32LittleEndian(data: Uint8Array, offset: number): number {
    return ((data[offset] ?? 0) + ((data[offset + 1] ?? 0) << 8) + ((data[offset + 2] ?? 0) << 16) + (data[offset + 3] ?? 0) * 0x1000000) >>> 0;
}

function startsWithBytes(data: Uint8Array, expected: readonly number[]): boolean {
    return hasBytesAt(data, 0, expected);
}

function hasBytesAt(data: Uint8Array, offset: number, expected: readonly number[]): boolean {
    return data.length >= offset + expected.length && expected.every((byte, index) => data[offset + index] === byte);
}

async function attachTextureDataAsync(scene: BabylonScene, textureAssets: ReadonlyMap<string, TextureAsset>): Promise<void> {
    const updates: Promise<void>[] = [];
    for (const texture of scene.textures) {
        if (!isUrlTexture(texture) || typeof texture.url !== "string") {
            continue;
        }
        const asset = textureAssets.get(texture.url);
        if (asset === undefined) {
            continue;
        }
        updates.push(
            new Promise((resolve) => {
                texture.updateURL(
                    asset.dataUri,
                    asset.dataUri,
                    () => {
                        texture.name = asset.name;
                        resolve();
                    },
                    asset.extension
                );
            })
        );
    }
    await Promise.all(updates);
}

interface UrlTexture extends BaseTexture {
    readonly url: string | null;
    updateURL(url: string, buffer: string, onLoad: () => void, forcedExtension: string): void;
}

function isUrlTexture(texture: BaseTexture): texture is UrlTexture {
    return "url" in texture && "updateURL" in texture && typeof texture.updateURL === "function";
}

function restoreMaterialNames(scene: BabylonScene, materialTokens: ReadonlyMap<string, string>): void {
    const namesByToken = new Map<string, string>();
    for (const [name, token] of materialTokens) {
        namesByToken.set(token, name);
        namesByToken.set(`${token}_line`, `${name}_line`);
    }
    for (const material of scene.materials) {
        material.name = namesByToken.get(material.name) ?? material.name;
        material.id = namesByToken.get(material.id) ?? material.id;
    }
}

function resolveDependencyUrl(reference: string, baseUrl: string, dependencyType: string): string {
    try {
        return new URL(reference, baseUrl).href;
    } catch (error) {
        throw new Error(`Invalid ${dependencyType} reference "${reference}" in "${baseUrl}".`, { cause: error });
    }
}

function createTextDataUri(text: string): string {
    return createDataUri(new TextEncoder().encode(text), "text/plain");
}

function createDirectTextSource(text: string): string {
    return `data:#,\n${text}`;
}
