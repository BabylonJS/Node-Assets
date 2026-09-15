import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { describe, expect, it, vi } from "vitest";

import { FbxInputBlock, GltfOutputBlock, NodeAsset, NodeAssetContext } from "../../src/index";
import { generateBinaryFbxData, generateFbxData, generateFbxDataUri, generateTexturedFbxDataWithUvs, generateTgaTextureData } from "../helpers/fbx";
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
        const textureUrl = "https://cdn.example.com/assets/textures/diffuse.tga";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    const response = new Response(generateTexturedFbxDataWithUvs("textures/diffuse.tga"));
                    Object.defineProperty(response, "url", { value: redirectedRootUrl });
                    return Promise.resolve(response);
                }
                if (String(input) === textureUrl) {
                    return Promise.resolve(new Response(generateTgaTextureData().buffer as ArrayBuffer, { headers: { "content-type": "image/x-tga" } }));
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
            expect(json.images).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("rejects when an external texture cannot be decoded", async () => {
        const rootUrl = "https://example.com/model";
        const redirectedRootUrl = "https://cdn.example.com/assets/scene.fbx";
        const textureUrl = "https://cdn.example.com/assets/textures/diffuse.png";
        const originalCreateTexture = NullEngine.prototype.createTexture;
        const createTextureSpy = vi.spyOn(NullEngine.prototype, "createTexture").mockImplementation(function (this: NullEngine, ...args: Parameters<NullEngine["createTexture"]>) {
            const buffer = args[7];
            if (typeof buffer !== "string" || !buffer.startsWith("data:image/png")) {
                return originalCreateTexture.apply(this, args);
            }
            args[5] = null;
            const texture = originalCreateTexture.apply(this, args);
            queueMicrotask(() => texture.onErrorObservable.notifyObservers({ message: "Unable to decode texture." }));
            return texture;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    const response = new Response(generateTexturedFbxDataWithUvs("textures/diffuse.png"));
                    Object.defineProperty(response, "url", { value: redirectedRootUrl });
                    return Promise.resolve(response);
                }
                if (String(input) === textureUrl) {
                    return Promise.resolve(new Response(new Uint8Array([0, 1, 2, 3]), { headers: { "content-type": "image/png" } }));
                }
                return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            })
        );

        try {
            await expect(roundTripAsync(new FbxInputBlock({ input: rootUrl }))).rejects.toThrow();
        } finally {
            createTextureSpy.mockRestore();
            vi.unstubAllGlobals();
        }
    }, 1_000);

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
