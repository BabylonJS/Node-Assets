import { describe, expect, it, vi } from "vitest";

import { Block } from "../../src/blocks/block";
import { defineBlock } from "../../src/blocks/blockDefinition";
import { BabylonSceneType } from "../../src/connectionPoints/babylonScene";
import { UrlType } from "../../src/connectionPoints/url";
import { FbxInputBlock, GltfOutputBlock, NodeAsset, NodeAssetContext } from "../../src/index";
import { generateBinaryFbxData, generateFbxData, generateFbxDataUri, generateTexturedFbxData } from "../helpers/fbx";
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
    ])("loads an extensionless HTTP $format asset", async ({ data }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(typeof data === "string" ? data : new Uint8Array(data).buffer)))
        );

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input: "https://example.com/model" })));

            expect(json.meshes).toHaveLength(1);
            expect(json.meshes?.[0]?.primitives).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("resolves redirected FBX texture dependencies and preserves the material", async () => {
        const rootUrl = "https://example.com/model";
        const redirectedRootUrl = "https://cdn.example.com/assets/scene.fbx";
        const textureUrl = "https://cdn.example.com/assets/textures/diffuse.png";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    const response = new Response(generateTexturedFbxData("textures/diffuse.png"));
                    Object.defineProperty(response, "url", { value: redirectedRootUrl });
                    return Promise.resolve(response);
                }
                return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            })
        );

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input: rootUrl })));

            expect(json.meshes).toHaveLength(1);
            expect(json.meshes?.[0]?.primitives).toHaveLength(1);
            expect(json.materials).toHaveLength(1);
            expect(json.materials?.[0]?.name).toBe("Textured");

            const source = new FbxInputBlock({ input: rootUrl });
            const destination = new TextureUrlOutputBlock();
            source.output.connectTo(destination.input);
            expect(await new NodeAsset({ name: "fbx-texture-url", outputBlock: destination }).executeAsync()).toBe(textureUrl);
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

const TextureUrlOutputBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "test.output.texture-url",
    input: BabylonSceneType,
    output: UrlType,
    run: (scene) => {
        const texture = scene.textures[0];
        if (texture === undefined || !("url" in texture) || typeof texture.url !== "string") {
            throw new Error("The FBX scene did not contain a URL texture.");
        }
        return texture.url;
    },
});

class TextureUrlOutputBlock extends Block<typeof TextureUrlOutputBlockDefinition> {
    public constructor() {
        super(TextureUrlOutputBlockDefinition);
    }
}
