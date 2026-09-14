import { DracoEncoder } from "@babylonjs/core/Meshes/Compression/dracoEncoder.js";

import { describe, expect, it } from "vitest";

import { DracoEncoderBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfDataUri } from "../helpers/gltf";

describe("Draco default reset", () => {
    it("keeps the shared runtime usable and replaces it after restoring stock configuration", async () => {
        const stockConfiguration = DracoEncoder.DefaultConfiguration;

        try {
            await new NodeAsset({ name: "first-draco-runtime", outputBlock: new DracoEncoderBlock() }).executeAsync();
            const firstWorkerPool = DracoEncoder.DefaultConfiguration.workerPool;
            expect(firstWorkerPool).toBeDefined();

            void DracoEncoder.Default;
            DracoEncoder.ResetDefault();
            expect(DracoEncoder.DefaultConfiguration.workerPool).toBe(firstWorkerPool);

            const source = new GltfInputBlock({ input: generateGltfDataUri() });
            const encoder = new DracoEncoderBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            encoder.output.connectTo(destination.geometryCompressionOptions);

            const { json } = await parseGlbAsync(await new NodeAsset({ name: "reset-draco-runtime", outputBlock: destination }).executeAsync());
            expect(json.extensionsUsed).toContain("KHR_draco_mesh_compression");

            DracoEncoder.ResetDefault();
            DracoEncoder.DefaultConfiguration = stockConfiguration;
            await new NodeAsset({ name: "second-draco-runtime", outputBlock: new DracoEncoderBlock() }).executeAsync();
            expect(DracoEncoder.DefaultConfiguration.workerPool).toBeDefined();
            expect(DracoEncoder.DefaultConfiguration.workerPool).not.toBe(firstWorkerPool);
        } finally {
            DracoEncoder.ResetDefault();
            DracoEncoder.DefaultConfiguration = stockConfiguration;
        }
    });
});
