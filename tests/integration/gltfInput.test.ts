import { describe, expect, it, vi } from "vitest";

import { GltfInputBlock, NodeAsset, NodeAssetContext } from "../../packages/core/src/index";
import { decodeDataUri, generateGlbDataUri, generateGltfJson } from "../helpers/gltf";

describe("glTF input", () => {
    it.each([
        { body: generateGltfJson(), format: "glTF", url: "https://example.com/model.gltf" },
        { body: decodeDataUri(generateGlbDataUri()), format: "GLB", url: "https://example.com/model.glb" },
    ])("loads $format through PlatformIO", async ({ body, url }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(body)))
        );

        try {
            const document = await new NodeAsset({ name: "gltf-input", outputBlock: new GltfInputBlock({ input: url }) }).executeAsync();

            expect(document.getRoot().listMeshes()).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accepts input through an execution context", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock();
            const asset = new NodeAsset({ name: "context-gltf-input", outputBlock: source });
            const context = new NodeAssetContext(asset);
            context.setInput(source, url);

            const document = await asset.executeAsync(context);

            expect(document.getRoot().listMeshes()).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
