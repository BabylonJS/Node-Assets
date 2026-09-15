import { describe, expect, it, vi } from "vitest";

import { EncodeDracoBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

describe("Draco encoding", () => {
    it("encodes connected glTF output", async () => {
        const parsed = await withGltfFetchAsync(async (url) => {
            const source = new GltfInputBlock({ input: url });
            const encoder = new EncodeDracoBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);
            return parseGlbAsync(await new NodeAsset({ name: "draco-compressed-glb", outputBlock: destination }).executeAsync());
        });

        expect(parsed.json.extensionsUsed).toContain("KHR_draco_mesh_compression");
        expect(parsed.json.meshes?.[0]?.primitives[0]?.extensions).toHaveProperty("KHR_draco_mesh_compression");
    });

    it("leaves glTF output uncompressed without the block", async () => {
        const parsed = await withGltfFetchAsync(async (url) => {
            const source = new GltfInputBlock({ input: url });
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            return parseGlbAsync(await new NodeAsset({ name: "uncompressed-glb", outputBlock: destination }).executeAsync());
        });

        expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
    });

    it("decodes compressed input before an uncompressed round trip", async () => {
        const compressed = await withGltfFetchAsync(async (url) => {
            const source = new GltfInputBlock({ input: url });
            const encoder = new EncodeDracoBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);
            return new NodeAsset({ name: "draco-source", outputBlock: destination }).executeAsync();
        });
        const url = "https://example.com/compressed.glb";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => compressed.arrayBuffer().then((data) => new Response(data)))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "decoded-draco", outputBlock: destination }).executeAsync());

            expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

async function withGltfFetchAsync<TResult>(action: (url: string) => Promise<TResult>): Promise<TResult> {
    const url = "https://example.com/model.gltf";
    vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
    );
    try {
        return await action(url);
    } finally {
        vi.unstubAllGlobals();
    }
}
