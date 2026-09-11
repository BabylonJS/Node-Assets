import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture.js";

import { describe, expect, it } from "vitest";

import { Block } from "../../src/blocks/block";
import { defineBlock } from "../../src/blocks/blockDefinition";
import { BabylonSceneType } from "../../src/connectionPoints/babylonScene";
import { GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfDataUri, generateTexturedGltfDataUri } from "../helpers/gltf";

describe("glTF output", () => {
    const extensionTextureFormats = [
        {
            extension: "EXT_texture_webp" as const,
            imageBase64: "UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoCAAIAAgA0JaACdLoB+AADsAD+8MQL/yC5YXXI1/8gP+QH/ID/+PIAAAA=",
            mimeType: "image/webp",
            name: "WebP",
        },
        {
            extension: "EXT_texture_avif" as const,
            imageBase64:
                "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAHwAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgUBsAAAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwwMDAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAnbWRhdBIACghYADY0BDQbhDIRGAAOOOOEAACwE1TtMKTrDPw=",
            mimeType: "image/avif",
            name: "AVIF",
        },
    ];

    const coreTextureFormats = [
        {
            generateInput: () => generateTexturedGltfDataUri(),
            mimeType: "image/png",
            name: "PNG",
        },
        {
            generateInput: () =>
                generateTexturedGltfDataUri({
                    imageBase64:
                        "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAACAAIDAREAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAVAQEBAAAAAAAAAAAAAAAAAAAHCf/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ADoDFU3/2Q==",
                    imageMimeType: "image/jpeg",
                }),
            mimeType: "image/jpeg",
            name: "JPEG",
        },
    ];

    it("exports a valid GLB", async () => {
        const source = new GltfInputBlock({ input: generateGltfDataUri() });
        const destination = new GltfOutputBlock();
        source.output.connectTo(destination.input);

        await parseGlbAsync(await new NodeAsset({ name: "valid-glb", outputBlock: destination }).executeAsync());
    });

    it.each(extensionTextureFormats)("exports $name textures through $extension", async ({ extension, imageBase64, mimeType }) => {
        const parsed = await roundTripAsync(
            generateTexturedGltfDataUri({
                imageBase64,
                imageMimeType: mimeType,
                textureExtension: extension,
            })
        );
        const imageIndex = parsed.json.images?.findIndex((image) => image.mimeType === mimeType);
        const texture = parsed.json.textures?.[0];

        expect(imageIndex).toBeGreaterThanOrEqual(0);
        expect(parsed.json.extensionsUsed).toContain(extension);
        expect(parsed.json.extensionsRequired).toContain(extension);
        expect(texture?.source).toBeUndefined();
        expect(texture?.extensions?.[extension]?.source).toBe(imageIndex);
    });

    it.each(coreTextureFormats)("exports $name textures through core texture.source", async ({ generateInput, mimeType }) => {
        const parsed = await roundTripAsync(generateInput());
        const imageIndex = parsed.json.images?.findIndex((image) => image.mimeType === mimeType);
        const texture = parsed.json.textures?.[0];

        expect(imageIndex).toBeGreaterThanOrEqual(0);
        expect(parsed.json.extensionsUsed ?? []).not.toContain("EXT_texture_webp");
        expect(parsed.json.extensionsUsed ?? []).not.toContain("EXT_texture_avif");
        expect(texture?.extensions).toBeUndefined();
        expect(texture?.source).toBe(imageIndex);
    });

    it("preserves texture transforms", async () => {
        const transformDefinition = defineBlock({
            type: "transform-texture",
            input: BabylonSceneType,
            output: BabylonSceneType,
            run: (scene) => {
                const texture = (scene.materials[0] as PBRMaterial).albedoTexture as Texture;
                texture.uOffset = 0.25;
                texture.vOffset = 0.5;
                texture.uScale = 0.75;
                texture.vScale = 0.625;
                texture.wAng = 0.125;
                texture.uRotationCenter = 0;
                texture.vRotationCenter = 0;
                texture.coordinatesIndex = 1;
                return scene;
            },
        });
        const source = new GltfInputBlock({ input: generateTexturedGltfDataUri() });
        const transform = new Block(transformDefinition);
        const destination = new GltfOutputBlock();
        source.output.connectTo(transform.input);
        transform.output.connectTo(destination.input);

        const parsed = await parseGlbAsync(await new NodeAsset({ name: "texture-transform", outputBlock: destination }).executeAsync());
        const textureTransform = parsed.json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture?.extensions?.KHR_texture_transform;

        expect(parsed.json.extensionsUsed).toContain("KHR_texture_transform");
        expect(textureTransform).toEqual({
            offset: [0.25, 0.5],
            rotation: -0.125,
            scale: [0.75, 0.625],
            texCoord: 1,
        });
    });
});

async function roundTripAsync(input: string) {
    const source = new GltfInputBlock({ input });
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);

    return parseGlbAsync(await new NodeAsset({ name: "textured-glb", outputBlock: destination }).executeAsync());
}
