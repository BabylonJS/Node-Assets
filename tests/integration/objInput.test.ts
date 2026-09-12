import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { describe, expect, it, vi } from "vitest";

import { Block } from "../../src/block/block";
import { defineBlock } from "../../src/block/blockDefinition";
import { BabylonSceneType } from "../../src/block/connectionPointType";
import { CompressTexturesBlock, GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../src/index";
import { expectKtx2Image, getTextureImageIndex, parseGlbAsync } from "../helpers/glb";
import { generateMtlData, generateObjDataUri, generateObjData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

describe("OBJ input", () => {
    it("loads generated OBJ data from a data URI", async () => {
        const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: generateObjDataUri() })));

        expect(json.meshes).toHaveLength(1);
        expect(json.meshes?.[0]?.primitives).toHaveLength(1);
    });

    it("loads an extensionless HTTP asset", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateObjData(), { headers: { "content-type": "text/plain" } })))
        );

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: "https://example.com/model" })));

            expect(json.meshes).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("resolves relative MTL and texture dependencies and preserves the material", async () => {
        const rootUrl = "https://example.com/assets/model";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        const textureUrl = "https://example.com/assets/materials/textures/diffuse.png";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            switch (String(input)) {
                case rootUrl:
                    return Promise.resolve(new Response(generateTexturedObjData(), { headers: { "content-type": "text/plain" } }));
                case mtlUrl:
                    return Promise.resolve(new Response(generateMtlData(), { headers: { "content-type": "text/plain" } }));
                case textureUrl:
                    return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer));
                default:
                    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            }
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: rootUrl })));

            expect(json.meshes).toHaveLength(1);
            expect(json.materials).toHaveLength(1);
            expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toBeDefined();
            expect(json.materials?.[0]?.normalTexture).toBeDefined();
            expect(json.images).toHaveLength(1);
            expect(json.images?.[0]?.name).toBe(textureUrl);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("compresses supported StandardMaterial image slots and preserves shared texture semantics", async () => {
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
            let originalSharedTexture: Texture | undefined;
            let originalBumpTexture: Texture | undefined;
            let preservedRawTexture: RawTexture | undefined;
            const configureMaterial = new Block(
                defineBlock({
                    type: "test.transform.configure-standard-material",
                    input: BabylonSceneType,
                    output: BabylonSceneType,
                    run: (scene) => {
                        const material = scene.materials[0];
                        if (!(material instanceof StandardMaterial) || !(material.diffuseTexture instanceof Texture) || !(material.bumpTexture instanceof Texture)) {
                            throw new Error("Expected the OBJ loader to create a textured StandardMaterial.");
                        }

                        originalSharedTexture = material.diffuseTexture;
                        originalBumpTexture = material.bumpTexture;
                        material.diffuseTexture.metadata = { source: "obj" };
                        material.diffuseTexture.hasAlpha = true;
                        material.diffuseTexture.getAlphaFromRGB = true;
                        material.diffuseTexture.isRGBD = true;
                        material.diffuseTexture.lodLevelInAlpha = true;
                        material.diffuseTexture.lodGenerationOffset = 0.25;
                        material.diffuseTexture.lodGenerationScale = 0.75;
                        material.diffuseTexture.linearSpecularLOD = true;
                        material.diffuseTexture.level = 0.75;
                        material.diffuseTexture.uOffset = 0.25;
                        material.diffuseTexture.vOffset = 0.5;
                        material.diffuseTexture.uScale = 0.75;
                        material.diffuseTexture.vScale = 0.625;
                        material.diffuseTexture.wAng = 0.125;
                        material.diffuseTexture.uRotationCenter = 0;
                        material.diffuseTexture.vRotationCenter = 0;
                        material.diffuseTexture.coordinatesIndex = 1;
                        material.diffuseTexture.updateSamplingMode(Texture.NEAREST_SAMPLINGMODE);
                        material.ambientTexture = material.diffuseTexture;
                        material.opacityTexture = material.diffuseTexture;
                        material.emissiveTexture = material.diffuseTexture;
                        material.specularTexture = material.diffuseTexture;
                        material.lightmapTexture = material.diffuseTexture;
                        material.reflectionTexture = material.diffuseTexture;
                        material.refractionTexture = material.diffuseTexture;
                        material.bumpTexture.metadata = { source: "obj-normal" };
                        scene.environmentTexture = material.diffuseTexture;

                        const preservedMaterial = new StandardMaterial("non-image-texture", scene);
                        preservedRawTexture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 255]), 1, 1, scene);
                        preservedMaterial.diffuseTexture = preservedRawTexture;
                        return scene;
                    },
                })
            );
            const verifyMaterial = new Block(
                defineBlock({
                    type: "test.transform.verify-standard-material",
                    input: BabylonSceneType,
                    output: BabylonSceneType,
                    run: (scene) => {
                        const material = scene.materials[0];
                        const preservedMaterial = scene.getMaterialByName("non-image-texture");
                        if (!(material instanceof StandardMaterial) || !(material.diffuseTexture instanceof Texture) || !(material.bumpTexture instanceof Texture)) {
                            throw new Error("Expected compressed StandardMaterial textures.");
                        }
                        if (!(preservedMaterial instanceof StandardMaterial)) {
                            throw new Error("Expected the non-image StandardMaterial.");
                        }

                        const sharedTexture = material.diffuseTexture;
                        expect(sharedTexture).not.toBe(originalSharedTexture);
                        expect(material.ambientTexture).toBe(sharedTexture);
                        expect(material.opacityTexture).toBe(sharedTexture);
                        expect(material.emissiveTexture).toBe(sharedTexture);
                        expect(material.specularTexture).toBe(sharedTexture);
                        expect(material.lightmapTexture).toBe(sharedTexture);
                        expect(material.reflectionTexture).toBe(sharedTexture);
                        expect(material.refractionTexture).toBe(sharedTexture);
                        expect(sharedTexture.metadata).toEqual({ source: "obj" });
                        expect(sharedTexture.hasAlpha).toBe(true);
                        expect(sharedTexture.getAlphaFromRGB).toBe(true);
                        expect(sharedTexture.isRGBD).toBe(true);
                        expect(sharedTexture.lodLevelInAlpha).toBe(true);
                        expect(sharedTexture.lodGenerationOffset).toBe(0.25);
                        expect(sharedTexture.lodGenerationScale).toBe(0.75);
                        expect(sharedTexture.linearSpecularLOD).toBe(true);
                        expect(sharedTexture.level).toBe(0.75);
                        expect(sharedTexture.uOffset).toBe(0.25);
                        expect(sharedTexture.vOffset).toBe(0.5);
                        expect(sharedTexture.uScale).toBe(0.75);
                        expect(sharedTexture.vScale).toBe(0.625);
                        expect(sharedTexture.wAng).toBe(0.125);
                        expect(sharedTexture.coordinatesIndex).toBe(1);
                        expect(sharedTexture.samplingMode).toBe(Texture.NEAREST_SAMPLINGMODE);
                        expect(material.bumpTexture).not.toBe(originalBumpTexture);
                        expect(material.bumpTexture).not.toBe(sharedTexture);
                        expect(material.bumpTexture.metadata).toEqual({ source: "obj-normal" });
                        expect(material.bumpTexture.level).toBe(0.5);
                        expect(scene.environmentTexture).toBe(originalSharedTexture);
                        expect(originalSharedTexture?.getInternalTexture()).not.toBeNull();
                        expect(preservedMaterial.diffuseTexture).toBe(preservedRawTexture);
                        return scene;
                    },
                })
            );
            const source = new ObjInputBlock({ input: rootUrl });
            const compressTextures = new CompressTexturesBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(configureMaterial.input);
            configureMaterial.output.connectTo(compressTextures.input);
            compressTextures.output.connectTo(verifyMaterial.input);
            verifyMaterial.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "obj-texture-compression", outputBlock: destination }).executeAsync());
            const material = parsed.json.materials?.[0];
            const baseColorTexture = material?.pbrMetallicRoughness?.baseColorTexture;
            const baseColorImageIndex = getTextureImageIndex(parsed, baseColorTexture?.index);
            const emissiveImageIndex = getTextureImageIndex(parsed, material?.emissiveTexture?.index);
            const occlusionImageIndex = getTextureImageIndex(parsed, material?.occlusionTexture?.index);
            const normalImageIndex = getTextureImageIndex(parsed, material?.normalTexture?.index);

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.extensionsRequired).toContain("KHR_texture_basisu");
            expect(parsed.json.images).toHaveLength(2);
            expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
            expect(parsed.json.images?.[baseColorImageIndex ?? -1]?.mimeType).toBe("image/ktx2");
            expect(parsed.json.images?.[normalImageIndex ?? -1]?.mimeType).toBe("image/ktx2");
            expect(normalImageIndex).not.toBe(baseColorImageIndex);
            expect(emissiveImageIndex).toBe(baseColorImageIndex);
            expect(occlusionImageIndex).toBe(baseColorImageIndex);
            expect(material?.normalTexture?.scale).toBe(0.5);
            expect(baseColorTexture?.extensions?.KHR_texture_transform).toEqual({
                offset: [0.25, 0.5],
                rotation: -0.125,
                scale: [0.75, 0.625],
                texCoord: 1,
            });
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("uses image MIME metadata from a shared extensionless texture wrapper", async () => {
        const rootUrl = "https://example.com/assets/model.obj";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        const textureUrl = "https://example.com/assets/materials/textures/diffuse";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                switch (String(input)) {
                    case rootUrl:
                        return Promise.resolve(new Response(generateTexturedObjData(), { headers: { "content-type": "text/plain" } }));
                    case mtlUrl:
                        return Promise.resolve(new Response(generateMtlData("textures/diffuse"), { headers: { "content-type": "text/plain" } }));
                    case textureUrl:
                        return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer, { headers: { "content-type": "application/octet-stream" } }));
                    default:
                        return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
                }
            })
        );

        try {
            const addMimeTypedWrapper = new Block(
                defineBlock({
                    type: "test.transform.add-mime-typed-texture-wrapper",
                    input: BabylonSceneType,
                    output: BabylonSceneType,
                    run: (scene) => {
                        const material = scene.materials[0];
                        if (!(material instanceof StandardMaterial) || !(material.diffuseTexture instanceof Texture)) {
                            throw new Error("Expected the OBJ loader to create a textured StandardMaterial.");
                        }

                        material.bumpTexture = new Texture(
                            textureUrl,
                            scene,
                            false,
                            false,
                            Texture.TRILINEAR_SAMPLINGMODE,
                            undefined,
                            undefined,
                            generateTextureData(),
                            false,
                            undefined,
                            "image/png"
                        );
                        return scene;
                    },
                })
            );
            const source = new ObjInputBlock({ input: rootUrl });
            const compressTextures = new CompressTexturesBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(addMimeTypedWrapper.input);
            addMimeTypedWrapper.output.connectTo(compressTextures.input);
            compressTextures.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "shared-texture-mime", outputBlock: destination }).executeAsync());

            expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
            expect(parsed.json.images).toHaveLength(2);
            expect(parsed.json.images?.every(({ mimeType }) => mimeType === "image/ktx2")).toBe(true);
            expectKtx2Image(parsed);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

async function roundTripAsync(source: ObjInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "obj-roundtrip", outputBlock: destination }).executeAsync();
}
