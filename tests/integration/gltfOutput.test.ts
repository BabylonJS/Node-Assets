import { describe, it, vi } from "vitest";

import { GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

describe("glTF output", () => {
    it("exports a valid GLB", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);

            await parseGlbAsync(await new NodeAsset({ name: "valid-glb", outputBlock: destination }).executeAsync());
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
