import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import { build, type Plugin } from "vite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as NodeAssets from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";
import { withInputFilesAsync } from "../helpers/input";
import { generateMtlData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

const ConsumerModuleId = "\0node-assets-browser-consumer";
const PublishedPackageName = "@babylonjs/node-assets";
const PublishedEntryPath = fileURLToPath(new URL("../../packages/core/dist/index.js", import.meta.url));

describe("browser consumer bundle", () => {
    beforeAll(buildLibrary, 120_000);

    it("bundles the published entry without resolving Node-only dependencies", async () => {
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
        expect(transformedModuleIds).toContain(PublishedEntryPath);
        expect(fileNames.some((fileName) => /draco_decoder_gltf.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /draco_encoder.*\.wasm$/.test(fileName))).toBe(true);
    }, 120_000);

    // TODO: Execute the published entry in a real browser once browser integration testing is available.
    it("runs the published entry in Node", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const { EncodeDracoBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } = (await import(
                `${pathToFileURL(PublishedEntryPath).href}?test=${Date.now()}`
            )) as typeof NodeAssets;
            const source = new GltfInputBlock({ input: url });
            const encoder = new EncodeDracoBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);

            await parseGlbAsync(await new NodeAsset({ name: "published-node-entry", outputBlock: destination }).executeAsync());
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("loads local OBJ dependencies through the published entry", async () => {
        const { NodeAsset, ObjInputBlock } = (await import(pathToFileURL(PublishedEntryPath).href)) as typeof NodeAssets;
        await withInputFilesAsync(
            {
                "model.obj": generateTexturedObjData("model.mtl"),
                "model.mtl": generateMtlData(),
                "textures/diffuse.png": generateTextureData(),
            },
            async (directory) => {
                const document = await new NodeAsset({ name: "published-obj", outputBlock: new ObjInputBlock({ input: join(directory, "model.obj") }) }).executeAsync();

                expect(document.getRoot().listMaterials()[0]?.getName()).toBe("Textured");
                expect(document.getRoot().listTextures()[0]?.getImage()).toEqual(generateTextureData());
            }
        );
    });
});

async function buildLibrary(): Promise<void> {
    await build({
        configFile: fileURLToPath(new URL("../../packages/core/vite.config.ts", import.meta.url)),
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
            if (id === "sharp" || id === "xhr2") {
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
