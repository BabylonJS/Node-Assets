import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { EncodeDracoBlock, EncodeKTX2Block, EncodeMeshoptBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { expectKtx2Image, parseGlbAsync } from "../helpers/glb";
import { generateTexturedGltfJson } from "../helpers/gltf";

describe("compressed GLB pipeline", () => {
    it("creates a Draco-compressed GLB with embedded KTX2 textures", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateTexturedGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const encodeTextures = new EncodeKTX2Block();
            const encodeGeometry = new EncodeDracoBlock();
            const destination = new GltfOutputBlock();

            source.output.connectTo(encodeTextures.input);
            encodeTextures.output.connectTo(encodeGeometry.input);
            encodeGeometry.output.connectTo(destination.input);

            const result = await new NodeAsset({ name: "compressed-glb", outputBlock: destination }).executeAsync();

            expectTypeOf(result).toEqualTypeOf<File>();
            expect(result).toBeInstanceOf(File);

            const parsed = await parseGlbAsync(result);
            expect(parsed.json.extensionsUsed).toContain("KHR_draco_mesh_compression");
            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("creates a Meshopt-compressed GLB with embedded KTX2 textures", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateTexturedGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const encodeTextures = new EncodeKTX2Block();
            const encodeGeometry = new EncodeMeshoptBlock();
            const destination = new GltfOutputBlock();

            source.output.connectTo(encodeTextures.input);
            encodeTextures.output.connectTo(encodeGeometry.input);
            encodeGeometry.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "meshopt-compressed-glb", outputBlock: destination }).executeAsync());
            expect(parsed.json.extensionsUsed).toContain("EXT_meshopt_compression");
            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
