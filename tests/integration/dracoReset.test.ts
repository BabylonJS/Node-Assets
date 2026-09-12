import { DracoEncoder } from "@babylonjs/core/Meshes/Compression/dracoEncoder.js";

import { describe, expect, it } from "vitest";

import { DracoEncoderBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfDataUri } from "../helpers/gltf";

describe("Draco default reset", () => {
    it("creates a fresh shared runtime after Babylon restores its stock configuration", async () => {
        const stockConfiguration = DracoEncoder.DefaultConfiguration;

        try {
            await new NodeAsset({ name: "first-draco-runtime", outputBlock: new DracoEncoderBlock() }).executeAsync();
            const firstWorkerPool = DracoEncoder.DefaultConfiguration.workerPool;
            expect(firstWorkerPool).toBeDefined();

            void DracoEncoder.Default;
            DracoEncoder.ResetDefault();
            DracoEncoder.DefaultConfiguration = stockConfiguration;

            await new NodeAsset({ name: "second-draco-runtime", outputBlock: new DracoEncoderBlock() }).executeAsync();
            expect(DracoEncoder.DefaultConfiguration.workerPool).toBeDefined();
            expect(DracoEncoder.DefaultConfiguration.workerPool).not.toBe(firstWorkerPool);

            const source = new GltfInputBlock({ input: generateGltfDataUri() });
            const encoder = new DracoEncoderBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            encoder.output.connectTo(destination.geometryCompressionOptions);

            const { json } = await parseGlbAsync(await new NodeAsset({ name: "reset-draco-runtime", outputBlock: destination }).executeAsync());
            expect(json.extensionsUsed).toContain("KHR_draco_mesh_compression");
        } finally {
            DracoEncoder.ResetDefault();
            DracoEncoder.DefaultConfiguration = stockConfiguration;
        }
    });
});
