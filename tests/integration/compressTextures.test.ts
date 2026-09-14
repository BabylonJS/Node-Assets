import { describe, expect, it, vi } from "vitest";

import { CompressTexturesBlock, FbxInputBlock, GltfInputBlock, GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../src/index";
import { generateTexturedFbxDataWithUvs } from "../helpers/fbx";
import { expectKtx2Image, getTextureImageIndex, parseGlbAsync } from "../helpers/glb";
import { generateTexturedGltfDataUri } from "../helpers/gltf";
import { generateMtlData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

describe("texture compression", () => {
    it("exports embedded KTX2 textures without enabling Draco", async () => {
        const result = await compressGltfAsync(generateTexturedGltfDataUri());
        const parsed = await parseGlbAsync(result);

        expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
        expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
        expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
        expect(parsed.json.images?.length).toBeGreaterThan(0);
        expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
        expectKtx2Image(parsed);
    });

    it("accepts an already-compressed GLB", async () => {
        const firstGlb = await compressGltfAsync(generateTexturedGltfDataUri());
        const secondGlb = await compressGltfAsync(`data:model/gltf-binary;base64,${toBase64(new Uint8Array(await firstGlb.arrayBuffer()))}`);
        const parsed = await parseGlbAsync(secondGlb);

        expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
        expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
        expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
        expectKtx2Image(parsed);
    });

    it("compresses StandardMaterial color and normal textures", async () => {
        const rootUrl = "https://example.com/assets/model.obj";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        const textureUrl = "https://example.com/assets/materials/textures/diffuse.png";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                switch (String(input)) {
                    case rootUrl:
                        return Promise.resolve(new Response(generateTexturedObjData(), { headers: { "content-type": "text/plain" } }));
                    case mtlUrl:
                        return Promise.resolve(new Response(generateMtlData(), { headers: { "content-type": "text/plain" } }));
                    case textureUrl:
                        return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } }));
                    default:
                        return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
                }
            })
        );

        try {
            const source = new ObjInputBlock({ input: rootUrl });
            const compressTextures = new CompressTexturesBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(compressTextures.input);
            compressTextures.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "standard-material-texture-compression", outputBlock: destination }).executeAsync());
            const material = parsed.json.materials?.[0];
            const baseColorTexture = material?.pbrMetallicRoughness?.baseColorTexture;
            const baseColorImageIndex = getTextureImageIndex(parsed, baseColorTexture?.index);
            const normalImageIndex = getTextureImageIndex(parsed, material?.normalTexture?.index);

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
            expect(parsed.json.images).toHaveLength(2);
            expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
            expect(parsed.json.images?.[baseColorImageIndex ?? -1]?.mimeType).toBe("image/ktx2");
            expect(parsed.json.images?.[normalImageIndex ?? -1]?.mimeType).toBe("image/ktx2");
            expect(normalImageIndex).not.toBe(baseColorImageIndex);
            expect(material?.normalTexture?.scale).toBe(0.5);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("compresses an extensionless StandardMaterial texture", async () => {
        const rootUrl = "https://example.com/model";
        const redirectedRootUrl = "https://cdn.example.com/assets/scene.fbx";
        const textureUrl = "https://cdn.example.com/assets/textures/diffuse";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    const response = new Response(generateTexturedFbxDataWithUvs("textures/diffuse"));
                    Object.defineProperty(response, "url", { value: redirectedRootUrl });
                    return Promise.resolve(response);
                }
                if (String(input) === textureUrl) {
                    return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } }));
                }
                return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            })
        );

        try {
            const source = new FbxInputBlock({ input: rootUrl });
            const compressTextures = new CompressTexturesBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(compressTextures.input);
            compressTextures.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "extensionless-texture-compression", outputBlock: destination }).executeAsync());
            const baseColorTexture = parsed.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture;
            const imageIndex = getTextureImageIndex(parsed, baseColorTexture?.index);

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
            expect(parsed.json.images).toHaveLength(1);
            expect(parsed.json.images?.[imageIndex ?? -1]?.mimeType).toBe("image/ktx2");
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

async function compressGltfAsync(input: string): Promise<File> {
    const source = new GltfInputBlock({ input });
    const compressTextures = new CompressTexturesBlock();
    const destination = new GltfOutputBlock();

    source.output.connectTo(compressTextures.input);
    compressTextures.output.connectTo(destination.input);

    return new NodeAsset({ name: "compress-textures", outputBlock: destination }).executeAsync();
}

function toBase64(data: Uint8Array): string {
    let binary = "";
    for (const byte of data) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary);
}
