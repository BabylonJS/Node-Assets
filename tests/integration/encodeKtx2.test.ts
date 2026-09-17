import { Document } from "@gltf-transform/core";
import { EXTTextureWebP } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";

import { EncodeKTX2Block, FbxInputBlock, GltfInputBlock, GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../packages/core/src/index";
import { generateTexturedFbxDataWithUvs } from "../helpers/fbx";
import { expectKtx2Image, getTextureImageIndex, parseGlbAsync } from "../helpers/glb";
import { generateTexturedGltfJson } from "../helpers/gltf";
import { withHttpInputsAsync } from "../helpers/input";
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
        await withHttpInputsAsync(
            {
                "model.obj": generateTexturedObjData("model.mtl"),
                "model.mtl": generateMtlData(),
                "textures/diffuse.png": generateTextureData(),
            },
            async (rootUrl) => {
                const source = new ObjInputBlock({ input: `${rootUrl}model.obj` });
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
            }
        );
    });

    it("encodes a texture from an FBX input", async () => {
        await withHttpInputsAsync({ "model.fbx": generateTexturedFbxDataWithUvs("textures/diffuse.png"), "textures/diffuse.png": generateTextureData() }, async (rootUrl) => {
            const source = new FbxInputBlock({ input: `${rootUrl}model.fbx` });
            const encoder = new EncodeKTX2Block();
            const destination = new GltfOutputBlock();
            source.output.connectTo(encoder.input);
            encoder.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "fbx-texture-encoding", outputBlock: destination }).executeAsync());

            expect(parsed.json.images).toHaveLength(1);
            expectKtx2Image(parsed);
        });
    });

    it("appends .ktx2 to extensionless texture URIs without collisions", async () => {
        const document = new Document();
        document.createTexture("albedo").setURI("albedo").setMimeType("image/png").setImage(generateTextureData());
        document.createTexture("normal").setURI("normal").setMimeType("image/png").setImage(generateTextureData());

        const result = await new NodeAsset({ name: "extensionless-texture-uris", outputBlock: new EncodeKTX2Block({ input: document }) }).executeAsync();

        expect(
            result
                .getRoot()
                .listTextures()
                .map((texture) => texture.getURI())
        ).toEqual(["albedo.ktx2", "normal.ktx2"]);
    });

    it("removes the WebP extension after converting every WebP texture", async () => {
        const document = new Document();
        document.createExtension(EXTTextureWebP).setRequired(true);
        document.createTexture("albedo").setMimeType("image/webp").setImage(generateTextureData());

        const result = await new NodeAsset({ name: "remove-webp-extension", outputBlock: new EncodeKTX2Block({ input: document }) }).executeAsync();

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
