import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

const ConsumerModuleId = "\0node-assets-gltf-input-consumer";
const Gltf1ModulePath = "/@babylonjs/loaders/glTF/1.0/";
const Gltf2LoaderModulePath = "/@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js";
const Gltf2ExtensionsModulePath = "/@babylonjs/loaders/glTF/2.0/Extensions/";
const ConcreteExtensionModuleName = /\/(?:EXT_|KHR_|MSFT_|ExtrasAsMetadata)[^/]*?(?:\.pure)?\.js$/;

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
        const eagerConcreteExtensions =
            loaderChunk === undefined
                ? []
                : Object.keys(loaderChunk.modules)
                      .map(normalizeModuleId)
                      .filter((moduleId) => moduleId.includes(Gltf2ExtensionsModulePath) && ConcreteExtensionModuleName.test(moduleId));

        expect(moduleIds.some((moduleId) => moduleId.includes(Gltf1ModulePath))).toBe(false);
        expect(loaderChunk).toBeDefined();
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
