import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

const ConsumerModuleId = "\0node-assets-draco-consumer";

interface BundleChunk {
    readonly code: string;
    readonly modules: Readonly<Record<string, unknown>>;
}

describe("Draco browser bundle", () => {
    it("emits package-owned encoder assets behind the Draco block", async () => {
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [createConsumerPlugin()],
            build: {
                assetsInlineLimit: 0,
                minify: false,
                rollupOptions: {
                    input: "node-assets:draco-consumer",
                },
                write: false,
            },
        });
        if (Array.isArray(result) || !("output" in result)) {
            throw new Error("Expected one consumer bundle");
        }

        const fileNames = result.output.map((output) => output.fileName);
        const blockModulePath = normalizeModuleId(fileURLToPath(new URL("../../src/blocks/dracoEncoderBlock.ts", import.meta.url)));
        const blockChunk = result.output.find(
            (output): output is Extract<(typeof result.output)[number], { type: "chunk" }> =>
                output.type === "chunk" &&
                Object.keys((output as BundleChunk).modules)
                    .map(normalizeModuleId)
                    .includes(blockModulePath)
        );

        expect(fileNames.some((fileName) => /draco_encoder.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /draco_encoder_wasm_wrapper.*\.js$/.test(fileName))).toBe(true);
        expect(blockChunk?.code).toMatch(/["']\/assets\/draco_encoder.*\.wasm["']/);
        expect(blockChunk?.code).toMatch(/["']\/assets\/draco_encoder_wasm_wrapper.*\.js["']/);
        expect(blockChunk?.code).toMatch(/return\s*\{\s*wasmBinaryUrl,\s*wasmUrl:\s*wasmWrapperUrl\s*\}/);
    }, 60_000);
});

function createConsumerPlugin(): Plugin {
    const blockPath = fileURLToPath(new URL("../../src/blocks/dracoEncoderBlock.ts", import.meta.url));
    return {
        name: "node-assets-draco-consumer",
        resolveId: (id) => (id === "node-assets:draco-consumer" ? ConsumerModuleId : undefined),
        load: (id) =>
            id === ConsumerModuleId
                ? `
                    import { DracoEncoderBlock } from ${JSON.stringify(blockPath)};
                    export const block = new DracoEncoderBlock();
                `
                : undefined,
    };
}

function normalizeModuleId(moduleId: string): string {
    return moduleId.replaceAll("\\", "/").replace(/^.*\/node_modules\//, "/");
}
