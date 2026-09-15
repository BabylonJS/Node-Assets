import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

const ConsumerModuleId = "\0node-assets-browser-consumer";

describe("browser consumer bundle", () => {
    it("bundles the public API and required Draco assets", async () => {
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [createConsumerPlugin()],
            build: {
                assetsInlineLimit: 0,
                rollupOptions: {
                    input: "node-assets:browser-consumer",
                },
                write: false,
            },
        });
        if (Array.isArray(result) || !("output" in result)) {
            throw new Error("Expected one consumer bundle");
        }

        const fileNames = result.output.map(({ fileName }) => fileName);
        expect(fileNames.some((fileName) => /draco_decoder_gltf.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /draco_encoder.*\.wasm$/.test(fileName))).toBe(true);
    }, 60_000);
});

function createConsumerPlugin(): Plugin {
    const indexPath = fileURLToPath(new URL("../../src/index.ts", import.meta.url));
    return {
        name: "node-assets-browser-consumer",
        resolveId: (id) => (id === "node-assets:browser-consumer" ? ConsumerModuleId : undefined),
        load: (id) =>
            id === ConsumerModuleId
                ? `
                    import * as nodeAssets from ${JSON.stringify(indexPath)};
                    globalThis.nodeAssets = nodeAssets;
                `
                : undefined,
    };
}
