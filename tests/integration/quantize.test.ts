import { NodeIO } from "@gltf-transform/core";
import { KHRMeshQuantization } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { GltfInputBlock, GltfOutputBlock, NodeAsset, QuantizeBlock } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

describe("mesh quantization", () => {
    it("quantizes connected glTF output", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const quantizer = new QuantizeBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(quantizer.input);
            quantizer.output.connectTo(destination.input);

            const output = await new NodeAsset({ name: "quantized-glb", outputBlock: destination }).executeAsync();
            const parsed = await parseGlbAsync(output);
            const document = await new NodeIO().registerExtensions([KHRMeshQuantization]).readBinary(new Uint8Array(await output.arrayBuffer()));
            const primitive = document.getRoot().listMeshes()[0]!.listPrimitives()[0]!;
            const position = primitive.getAttribute("POSITION")!;
            const normal = primitive.getAttribute("NORMAL")!;

            expect(parsed.json.extensionsUsed).toContain("KHR_mesh_quantization");
            expect(parsed.json.extensionsRequired).toContain("KHR_mesh_quantization");
            expect(position.getArray()).toBeInstanceOf(Int16Array);
            expect(position.getNormalized()).toBe(true);
            expect(normal.getArray()).toBeInstanceOf(Int16Array);
            expect(normal.getNormalized()).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
