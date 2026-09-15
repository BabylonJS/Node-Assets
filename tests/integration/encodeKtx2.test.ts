import { Document } from "@gltf-transform/core";
import { EXTTextureWebP } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { EncodeKTX2Block, FbxInputBlock, GltfInputBlock, GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../src/index";
import { generateTexturedFbxDataWithUvs } from "../helpers/fbx";
import { expectKtx2Image, getTextureImageIndex, parseGlbAsync } from "../helpers/glb";
import { generateTexturedGltfJson } from "../helpers/gltf";
import { generateMtlData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

describe("KTX2 encoding", () => {
    it("exports embedded KTX2 textures", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateTexturedGltfJson())))
        );

        try {
            const parsed = await parseGlbAsync(await encodeGltfAsync(url));

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
            expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accepts an already-compressed GLB", async () => {
        const sourceUrl = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateTexturedGltfJson())))
        );
        const firstGlb = await encodeGltfAsync(sourceUrl);
        const encodedUrl = "https://example.com/model.glb";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => firstGlb.arrayBuffer().then((data) => new Response(data)))
        );

        try {
            const parsed = await parseGlbAsync(await encodeGltfAsync(encodedUrl));

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("encodes a texture shared by color and normal slots once", async () => {
        const rootUrl = "https://example.com/assets/model.obj";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        const textureUrl = "https://example.com/assets/materials/textures/diffuse.png";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                switch (String(input)) {
                    case rootUrl:
                        return Promise.resolve(new Response(generateTexturedObjData()));
                    case mtlUrl:
                        return Promise.resolve(new Response(generateMtlData()));
                    case textureUrl:
                        return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer));
                    default:
                        return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
                }
            })
        );

        try {
            const source = new ObjInputBlock({ input: rootUrl });
            const encoder = new EncodeKTX2Block();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "shared-texture-encoding", outputBlock: destination }).executeAsync());
            const material = parsed.json.materials?.[0];
            const colorImageIndex = getTextureImageIndex(parsed, material?.pbrMetallicRoughness?.baseColorTexture?.index);
            const normalImageIndex = getTextureImageIndex(parsed, material?.normalTexture?.index);

            expect(parsed.json.images).toHaveLength(1);
            expect(colorImageIndex).toBe(normalImageIndex);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("encodes a texture from an FBX input", async () => {
        const rootUrl = "https://example.com/model.fbx";
        const textureUrl = "https://example.com/textures/diffuse.png";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    return Promise.resolve(new Response(generateTexturedFbxDataWithUvs("textures/diffuse.png")));
                }
                if (String(input) === textureUrl) {
                    return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } }));
                }
                return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            })
        );

        try {
            const source = new FbxInputBlock({ input: rootUrl });
            const encoder = new EncodeKTX2Block();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "fbx-texture-encoding", outputBlock: destination }).executeAsync());

            expect(parsed.json.images).toHaveLength(1);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("preserves unique extensionless texture URIs and removes obsolete WebP requirements", async () => {
        const document = new Document();
        document.createExtension(EXTTextureWebP).setRequired(true);
        document.createTexture("albedo").setURI("albedo").setMimeType("image/webp").setImage(generateTextureData());
        document.createTexture("normal").setURI("normal").setMimeType("image/png").setImage(generateTextureData());

        const result = await new NodeAsset({ name: "texture-metadata", outputBlock: new EncodeKTX2Block({ input: document }) }).executeAsync();

        expect(
            result
                .getRoot()
                .listTextures()
                .map((texture) => texture.getURI())
        ).toEqual(["albedo.ktx2", "normal.ktx2"]);
        expect(result.hasExtension(EXTTextureWebP.EXTENSION_NAME)).toBe(false);
    });
});

async function encodeGltfAsync(input: string): Promise<File> {
    const source = new GltfInputBlock({ input });
    const encoder = new EncodeKTX2Block();
    const destination = new GltfOutputBlock();
    source.output.connectTo(encoder.input);
    encoder.output.connectTo(destination.input);
    return new NodeAsset({ name: "encode-ktx2", outputBlock: destination }).executeAsync();
}
