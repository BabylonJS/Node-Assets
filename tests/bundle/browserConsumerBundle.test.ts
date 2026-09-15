import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

import { build, type Plugin } from "vite";
import { describe, expect, it } from "vitest";

const ConsumerModuleId = "\0node-assets-browser-consumer";
const PublishedPackageName = "@babylonjs/node-assets";

describe("browser consumer bundle", () => {
    it("bundles the published browser entry without Node-only dependencies", async () => {
        await buildLibrary();

        const publishedBrowserEntryPath = fileURLToPath(new URL("../../dist/index.browser.js", import.meta.url));
        const transformedModuleIds = new Set<string>();
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [rejectNodeOnlyDependencies(), createConsumerPlugin(), trackTransformedModules(transformedModuleIds)],
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
        expect(transformedModuleIds).toContain(publishedBrowserEntryPath);
        expect(fileNames.some((fileName) => /draco_decoder_gltf.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /draco_encoder.*\.wasm$/.test(fileName))).toBe(true);
    }, 120_000);
});

async function buildLibrary(): Promise<void> {
    await build({
        configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
        logLevel: "silent",
    });
    await build({
        configFile: fileURLToPath(new URL("../../vite.browser.config.ts", import.meta.url)),
        logLevel: "silent",
    });
}

function createConsumerPlugin(): Plugin {
    return {
        name: "node-assets-browser-consumer",
        resolveId: (id) => (id === "node-assets:browser-consumer" ? ConsumerModuleId : undefined),
        load: (id) =>
            id === ConsumerModuleId
                ? `
                    import * as nodeAssets from ${JSON.stringify(PublishedPackageName)};
                    globalThis.nodeAssets = nodeAssets;
                `
                : undefined,
    };
}

function rejectNodeOnlyDependencies(): Plugin {
    return {
        name: "node-assets-reject-node-only-dependencies",
        enforce: "pre",
        resolveId(id) {
            if (id === "sharp" || isBuiltin(id)) {
                throw new Error(`Browser consumer attempted to resolve ${id}`);
            }
        },
    };
}

function trackTransformedModules(moduleIds: Set<string>): Plugin {
    return {
        name: "node-assets-track-transformed-modules",
        transform(_code, id) {
            moduleIds.add(id);
        },
    };
}
