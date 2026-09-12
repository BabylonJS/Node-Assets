import { describe, expect, it, vi } from "vitest";

import { FbxInputBlock, GltfOutputBlock, NodeAsset, NodeAssetContext } from "../../src/index";
import { runWithoutBase64EncodingAsync } from "../helpers/base64";
import { generateBinaryFbxData, generateFbxData, generateFbxDataUri } from "../helpers/fbx";
import { parseGlbAsync } from "../helpers/glb";

describe("FBX input", () => {
    it("loads generated FBX data without relying on a URL extension", async () => {
        const { json } = await parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input: generateFbxDataUri() })));

        expect(json.meshes).toHaveLength(1);
        expect(json.meshes?.[0]?.primitives).toHaveLength(1);
    });

    it.each([
        { data: generateFbxData(), format: "ASCII" },
        { data: generateBinaryFbxData(), format: "binary" },
    ])("loads an extensionless HTTP $format asset without base64 encoding", async ({ data }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(typeof data === "string" ? data : new Uint8Array(data).buffer)))
        );

        try {
            const { json } = await runWithoutBase64EncodingAsync(async () => parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input: "https://example.com/model" }))));

            expect(json.meshes).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accepts input through an execution context", async () => {
        const source = new FbxInputBlock();
        const destination = new GltfOutputBlock();
        source.output.connectTo(destination.input);
        const asset = new NodeAsset({ name: "context-fbx-to-glb", outputBlock: destination });
        const context = new NodeAssetContext(asset);
        context.setInput(source, generateFbxDataUri());

        const { json } = await parseGlbAsync(await asset.executeAsync(context));

        expect(json.meshes).toHaveLength(1);
    });
});

async function roundTripAsync(source: FbxInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "fbx-roundtrip", outputBlock: destination }).executeAsync();
}
