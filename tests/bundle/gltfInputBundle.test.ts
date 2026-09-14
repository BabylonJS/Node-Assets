import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

const ConsumerModuleId = "\0node-assets-gltf-input-consumer";
const Gltf1ModulePath = "/@babylonjs/loaders/glTF/1.0/";
const Gltf2LoaderModulePath = "/@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js";
const Gltf2DynamicExtensionsModulePath = "/@babylonjs/loaders/glTF/2.0/Extensions/dynamic.js";
const Gltf2ExtensionsModulePath = "/@babylonjs/loaders/glTF/2.0/Extensions/";
const ConcreteExtensionModuleName = /\/(?:EXT_|KHR_|MSFT_|ExtrasAsMetadata)[^/]*?(?:\.pure)?\.js$/;

interface BundleChunk {
    readonly fileName: string;
    readonly imports: readonly string[];
    readonly modules: Readonly<Record<string, unknown>>;
}

describe("glTF input consumer bundle", () => {
    it("excludes glTF 1 and splits concrete glTF 2 extensions from the loader", async () => {
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [createConsumerPlugin()],
            build: {
                minify: false,
                rollupOptions: {
                    input: "node-assets:gltf-input-consumer",
                    output: {
                        entryFileNames: "consumer.js",
                        chunkFileNames: "[name].js",
                    },
                },
                write: false,
            },
        });
        if (Array.isArray(result) || !("output" in result)) {
            throw new Error("Expected one consumer bundle");
        }

        const chunks = result.output.filter((output) => output.type === "chunk");
        const moduleIds = chunks.flatMap((chunk) => Object.keys(chunk.modules).map(normalizeModuleId));
        const loaderChunk = chunks.find((chunk) => Object.keys(chunk.modules).map(normalizeModuleId).includes(Gltf2LoaderModulePath));
        const dynamicExtensionsChunk = chunks.find((chunk) => Object.keys(chunk.modules).map(normalizeModuleId).includes(Gltf2DynamicExtensionsModulePath));
        const eagerModuleIds = collectStaticModuleIds(chunks, [loaderChunk, dynamicExtensionsChunk]);
        const eagerConcreteExtensions = eagerModuleIds.filter((moduleId) => moduleId.includes(Gltf2ExtensionsModulePath) && ConcreteExtensionModuleName.test(moduleId));

        expect(moduleIds.some((moduleId) => moduleId.includes(Gltf1ModulePath))).toBe(false);
        expect(loaderChunk).toBeDefined();
        expect(dynamicExtensionsChunk).toBeDefined();
        expect(eagerConcreteExtensions).toEqual([]);
    }, 60_000);
});

function createConsumerPlugin(): Plugin {
    const blockPath = fileURLToPath(new URL("../../src/blocks/gltfInputBlock.ts", import.meta.url));
    return {
        name: "node-assets-gltf-input-consumer",
        resolveId: (id) => (id === "node-assets:gltf-input-consumer" ? ConsumerModuleId : undefined),
        load: (id) =>
            id === ConsumerModuleId
                ? `
                    import { GltfInputBlock } from ${JSON.stringify(blockPath)};
                    export const block = new GltfInputBlock();
                `
                : undefined,
    };
}

function normalizeModuleId(moduleId: string): string {
    return moduleId.replaceAll("\\", "/").replace(/^.*\/node_modules\//, "/");
}

function collectStaticModuleIds(chunks: readonly BundleChunk[], roots: ReadonlyArray<BundleChunk | undefined>): string[] {
    const chunksByFileName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
    const visited = new Set<string>();
    const visit = (chunk: BundleChunk | undefined): void => {
        if (chunk === undefined || visited.has(chunk.fileName)) {
            return;
        }
        visited.add(chunk.fileName);
        chunk.imports.forEach((fileName) => visit(chunksByFileName.get(fileName)));
    };
    roots.forEach(visit);
    return Array.from(visited).flatMap((fileName) => Object.keys(chunksByFileName.get(fileName)?.modules ?? {}).map(normalizeModuleId));
}
