import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

import { Document } from "@gltf-transform/core";
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
import { build, type Plugin } from "vite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type * as NodeAssets from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

const ConsumerModuleId = "\0node-assets-browser-consumer";
const PublishedPackageName = "@babylonjs/node-assets";
const PublishedEntryPath = fileURLToPath(new URL("../../packages/core/dist/index.js", import.meta.url));

describe("browser consumer bundle", () => {
    beforeAll(buildLibrary, 120_000);

    it("bundles the published entry without resolving Sharp", async () => {
        const transformedModuleIds = new Set<string>();
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [rejectSharp(), createConsumerPlugin(), trackTransformedModules(transformedModuleIds)],
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
        expect(fileNames.some((fileName) => /msc_basis_transcoder.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /uastc_rgba8_srgb_v2.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /uastc_rgba8_unorm_v2.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /zstddec.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /basis_encoder.*\.js$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /basis_encoder.*\.wasm$/.test(fileName))).toBe(true);
    }, 120_000);

    it("tree-shakes KTX2 decoder code from an encoder-only published consumer", async () => {
        const transformedModuleIds = new Set<string>();
        const result = await build({
            configFile: false,
            logLevel: "silent",
            plugins: [rejectSharp(), createEncoderOnlyConsumerPlugin(), trackTransformedModules(transformedModuleIds)],
            build: {
                assetsInlineLimit: 0,
                rollupOptions: {
                    input: "node-assets:encoder-only-browser-consumer",
                },
                write: false,
            },
        });
        if (Array.isArray(result) || !("output" in result)) {
            throw new Error("Expected one consumer bundle");
        }

        const fileNames = result.output.map(({ fileName }) => fileName);
        const publishedFiles = await readdir(dirname(PublishedEntryPath));
        const encoderFactory = await readFile(new URL("../../node_modules/babylonpress-ktx2-encoder/dist/basis/basis_encoder.js", import.meta.url));
        const publishedScripts = await Promise.all(
            publishedFiles.filter((fileName) => fileName.endsWith(".js")).map((fileName) => readFile(resolve(dirname(PublishedEntryPath), fileName)))
        );
        expect(transformedModuleIds).toContain(PublishedEntryPath);
        expect(publishedScripts.some((script) => script.equals(encoderFactory))).toBe(false);
        expect(publishedFiles.some((fileName) => /basis_encoder.*\.wasm$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /basis_encoder.*\.js$/.test(fileName))).toBe(true);
        expect(fileNames.some((fileName) => /basis_encoder.*\.wasm$/.test(fileName))).toBe(true);
        const chunks = result.output.filter((entry) => entry.type === "chunk");
        // Vite can emit unreferenced assets during module scanning; check the executable output graph.
        expect(chunks.some((chunk) => Object.keys(chunk.modules).some((id) => id.includes("babylonpress-ktx2-encoder")))).toBe(true);
        expect(chunks.some((chunk) => Object.keys(chunk.modules).some((id) => id.includes("ktx2Decoder") || id.includes("@babylonjs/ktx2decoder")))).toBe(false);
        expect(chunks.some((chunk) => chunk.dynamicImports.some((id) => /ktx2Decoder|msc-transcoder/.test(id)))).toBe(false);
    }, 120_000);

    it("runs the published entry in Node", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const { EncodeDracoBlock, GltfInputBlock, GltfOutputBlock, NodeAsset, ValidateBlock } = (await import(
                `${pathToFileURL(PublishedEntryPath).href}?test=${Date.now()}`
            )) as typeof NodeAssets;
            const source = new GltfInputBlock({ input: url });
            const encoder = new EncodeDracoBlock();
            const validate = new ValidateBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(validate.input);
            validate.output.connectTo(destination.input);

            await parseGlbAsync(await new NodeAsset({ name: "published-node-entry", outputBlock: destination }).executeAsync());
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("resizes KTX2 through the published Node entry", async () => {
        const width = 32;
        const height = 16;
        const data = new Uint8Array(width * height * 4);
        for (let offset = 0; offset < data.length; offset += 4) {
            data[offset] = offset % 251;
            data[offset + 1] = (offset * 3) % 251;
            data[offset + 2] = (offset * 7) % 251;
            data[offset + 3] = offset % 8 === 0 ? 128 : 255;
        }
        const image = await encodeToKTX2(new Uint8Array(), {
            imageDecoder: async () => ({ data, height, width }),
            isHDR: false,
            isPerceptual: true,
            isSetKTX2SRGBTransferFunc: true,
            isUASTC: false,
        });
        const document = new Document();
        const texture = document.createTexture().setMimeType("image/ktx2").setImage(image);
        const { ClampTextureSizeBlock, NodeAsset } = (await import(`${pathToFileURL(PublishedEntryPath).href}?test=ktx2-${Date.now()}`)) as typeof NodeAssets;

        await new NodeAsset({
            name: "published-node-ktx2-resize",
            outputBlock: new ClampTextureSizeBlock({ input: document, maxSize: 8 }),
        }).executeAsync();

        const output = texture.getImage();
        expect(output).not.toBeNull();
        const header = new DataView(output!.buffer, output!.byteOffset, output!.byteLength);
        expect([header.getUint32(20, true), header.getUint32(24, true)]).toEqual([8, 4]);
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

function createEncoderOnlyConsumerPlugin(): Plugin {
    const moduleId = "\0node-assets-encoder-only-browser-consumer";
    return {
        name: "node-assets-encoder-only-browser-consumer",
        resolveId: (id) => (id === "node-assets:encoder-only-browser-consumer" ? moduleId : undefined),
        load: (id) =>
            id === moduleId
                ? `
                    import { EncodeKTX2Block } from ${JSON.stringify(PublishedPackageName)};
                    globalThis.EncodeKTX2Block = EncodeKTX2Block;
                `
                : undefined,
    };
}

function rejectSharp(): Plugin {
    return {
        name: "node-assets-reject-sharp",
        enforce: "pre",
        resolveId(id) {
            if (id === "sharp") {
                throw new Error("Browser consumer attempted to resolve sharp");
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
