import { describe, expect, it } from "vitest";

import { Block } from "../../src/block/block";
import { defineBlock } from "../../src/block/blockDefinition";
import { BabylonSceneType } from "../../src/block/connectionPointType";
import { CompressTexturesBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { expectKtx2Image, parseGlbAsync } from "../helpers/glb";
import { generateTexturedGltfDataUri } from "../helpers/gltf";

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

    it("loads compressed replacements when the scene uses delayed texture loading", async () => {
        const source = new GltfInputBlock({ input: generateTexturedGltfDataUri() });
        const enableDelayedLoading = new Block(
            defineBlock({
                type: "test.transform.enable-delayed-texture-loading",
                input: BabylonSceneType,
                output: BabylonSceneType,
                run: (scene) => {
                    scene.useDelayedTextureLoading = true;
                    return scene;
                },
            })
        );
        const compressTextures = new CompressTexturesBlock();
        const destination = new GltfOutputBlock();
        source.output.connectTo(enableDelayedLoading.input);
        enableDelayedLoading.output.connectTo(compressTextures.input);
        compressTextures.output.connectTo(destination.input);

        const parsed = await parseGlbAsync(await new NodeAsset({ name: "delayed-texture-compression", outputBlock: destination }).executeAsync());

        expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
        expectKtx2Image(parsed);
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
