import { DracoEncoder } from "@babylonjs/core/Meshes/Compression/dracoEncoder.js";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { Scene } from "@babylonjs/core/scene.js";

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { DracoEncoderBlock, GltfInputBlock, GltfOutputBlock, NodeAsset, type GltfMeshCompressionOptions } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfDataUri } from "../helpers/gltf";

describe("Draco compression", () => {
    it("preserves a caller-customized default encoder configuration", async () => {
        const originalConfiguration = DracoEncoder.DefaultConfiguration;
        const customConfiguration = {
            fallbackUrl: "https://example.test/custom-draco-encoder.js",
            numWorkers: 1,
        };
        DracoEncoder.ResetDefault(true);
        DracoEncoder.DefaultConfiguration = customConfiguration;

        try {
            await new NodeAsset({ name: "custom-draco-encoder", outputBlock: new DracoEncoderBlock() }).executeAsync();
            expect(DracoEncoder.DefaultConfiguration).toBe(customConfiguration);
        } finally {
            DracoEncoder.ResetDefault(true);
            DracoEncoder.DefaultConfiguration = originalConfiguration;
        }
    });

    it("keeps warmed-up Node encoding off the event loop", async () => {
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const mesh = new Mesh("draco-mesh", scene);
        const vertexData = new VertexData();
        vertexData.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
        vertexData.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
        vertexData.indices = [0, 1, 2];
        vertexData.applyToMesh(mesh);
        vi.stubGlobal("window", {});

        try {
            await new NodeAsset({ name: "node-draco-encoder", outputBlock: new DracoEncoderBlock() }).executeAsync();
            await DracoEncoder.Default.encodeMeshAsync(mesh);

            const firstResult = await Promise.race([
                DracoEncoder.Default.encodeMeshAsync(mesh).then(() => "encoded" as const),
                new Promise<"event-loop">((resolve) => setImmediate(() => resolve("event-loop"))),
            ]);

            expect(firstResult).toBe("event-loop");
        } finally {
            vi.unstubAllGlobals();
            scene.dispose();
            engine.dispose();
        }
    });

    it("leaves unconnected glTF output uncompressed", async () => {
        const source = new GltfInputBlock({ input: generateGltfDataUri() });
        const destination = new GltfOutputBlock();
        source.output.connectTo(destination.input);

        const result = await new NodeAsset({ name: "uncompressed-glb", outputBlock: destination }).executeAsync();
        const { json } = await parseGlbAsync(result);

        expect(json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
        expect(json.meshes?.[0]?.primitives[0]?.extensions?.KHR_draco_mesh_compression).toBeUndefined();
    });

    it("compresses concurrent connected glTF outputs", async () => {
        const assets = ["first", "second"].map((name) => {
            const source = new GltfInputBlock({ input: generateGltfDataUri() });
            const encoder = new DracoEncoderBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            encoder.output.connectTo(destination.geometryCompressionOptions);
            return new NodeAsset({ name: `draco-compressed-${name}-glb`, outputBlock: destination });
        });

        const results = await Promise.all(assets.map((asset) => asset.executeAsync()));
        for (const result of results) {
            const { json } = await parseGlbAsync(result);
            expect(json.extensionsUsed).toContain("KHR_draco_mesh_compression");
            expect(json.meshes?.[0]?.primitives[0]?.extensions).toHaveProperty("KHR_draco_mesh_compression");
        }
    });

    it("provides per-export glTF mesh compression options", async () => {
        const encoderBlock = new DracoEncoderBlock();
        const result = await new NodeAsset({ name: "draco-encoder", outputBlock: encoderBlock }).executeAsync();

        expectTypeOf(result).toEqualTypeOf<GltfMeshCompressionOptions>();
        expect(result).toEqual({ meshCompressionMethod: "Draco" });
    });

    it("leaves a later unconnected glTF output uncompressed", async () => {
        const compressedSource = new GltfInputBlock({ input: generateGltfDataUri() });
        const encoder = new DracoEncoderBlock();
        const compressedDestination = new GltfOutputBlock();
        compressedSource.output.connectTo(compressedDestination.input);
        encoder.output.connectTo(compressedDestination.geometryCompressionOptions);

        await new NodeAsset({ name: "draco-compressed-glb", outputBlock: compressedDestination }).executeAsync();

        const uncompressedSource = new GltfInputBlock({ input: generateGltfDataUri() });
        const uncompressedDestination = new GltfOutputBlock();
        uncompressedSource.output.connectTo(uncompressedDestination.input);

        const result = await new NodeAsset({ name: "uncompressed-glb", outputBlock: uncompressedDestination }).executeAsync();
        const { json } = await parseGlbAsync(result);

        expect(json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
        expect(json.meshes?.[0]?.primitives[0]?.extensions?.KHR_draco_mesh_compression).toBeUndefined();
    });
});
