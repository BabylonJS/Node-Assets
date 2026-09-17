import { describe, expect, it, vi } from "vitest";

import { EncodeMeshoptBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

describe("Meshopt encoding", () => {
    it("encodes connected glTF output", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const encoder = new EncodeMeshoptBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "meshopt-compressed-glb", outputBlock: destination }).executeAsync());

            expect(parsed.json.extensionsUsed).toContain("EXT_meshopt_compression");
            expect(parsed.json.bufferViews?.some(({ extensions }) => extensions?.EXT_meshopt_compression !== undefined)).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("decodes compressed input before an uncompressed round trip", async () => {
        const sourceUrl = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );
        const source = new GltfInputBlock({ input: sourceUrl });
        const encoder = new EncodeMeshoptBlock();
        const compressedDestination = new GltfOutputBlock();
        source.output.connectTo(encoder.input);
        encoder.output.connectTo(compressedDestination.input);
        const compressed = await new NodeAsset({ name: "meshopt-source", outputBlock: compressedDestination }).executeAsync();

        const compressedUrl = "https://example.com/compressed.glb";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => compressed.arrayBuffer().then((data) => new Response(data)))
        );
        try {
            const compressedSource = new GltfInputBlock({ input: compressedUrl });
            const destination = new GltfOutputBlock();
            compressedSource.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "decoded-meshopt", outputBlock: destination }).executeAsync());

            expect(parsed.json.extensionsUsed ?? []).not.toContain("EXT_meshopt_compression");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
