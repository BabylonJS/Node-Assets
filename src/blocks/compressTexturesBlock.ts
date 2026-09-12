import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";
import type sharpFactory from "sharp";

import { Block } from "./block";
import { defineBlock } from "./blockDefinition";
import { BabylonSceneType } from "../connectionPoints/babylonScene";

type CompressTexturesBlockDefinition = ReturnType<typeof createCompressTexturesBlockDefinition>;

let compressTexturesBlockDefinition: CompressTexturesBlockDefinition | undefined;

/** Compresses supported 2D image textures used by built-in PBR and standard materials to KTX2. */
export class CompressTexturesBlock extends Block<CompressTexturesBlockDefinition> {
    public constructor() {
        super((compressTexturesBlockDefinition ??= createCompressTexturesBlockDefinition()));
    }
}

interface TextureReference {
    readonly texture: BaseTexture;
    readonly isNormalMap: boolean;
    replace(texture: BaseTexture): void;
}

interface TextureEncodingSemantics {
    readonly isNormalMap: boolean;
    readonly isPerceptual: boolean;
    readonly isSetKTX2SRGBTransferFunc: boolean;
}

function createCompressTexturesBlockDefinition() {
    return defineBlock({
        type: "transform.compress-textures",
        input: BabylonSceneType,
        output: BabylonSceneType,
        runAsync: compressTexturesAsync,
    });
}

async function compressTexturesAsync(scene: BabylonScene): Promise<BabylonScene> {
    const [{ PBRMaterial }, { StandardMaterial }, { Texture }, { GetMimeType }, { GetCachedImageAsync }, { RegisterKHR_texture_basisu }] = await Promise.all([
        import("@babylonjs/core/Materials/PBR/pbrMaterial.js"),
        import("@babylonjs/core/Materials/standardMaterial.js"),
        import("@babylonjs/core/Materials/Textures/texture.js"),
        import("@babylonjs/core/Misc/fileTools.js"),
        import("@babylonjs/serializers/exportImageUtils.js"),
        import("@babylonjs/serializers/glTF/2.0/Extensions/KHR_texture_basisu.pure.js"),
    ]);

    RegisterKHR_texture_basisu();

    const referencesByTexture = new Map<Texture, Map<boolean, TextureReference[]>>();
    for (const material of scene.materials) {
        const references =
            material instanceof PBRMaterial ? getPbrTextureReferences(material) : material instanceof StandardMaterial ? getStandardTextureReferences(material) : undefined;
        if (references === undefined) {
            continue;
        }
        for (const reference of references) {
            if (!(reference.texture instanceof Texture) || reference.texture.constructor !== Texture) {
                continue;
            }
            const referencesBySemantics = referencesByTexture.get(reference.texture) ?? new Map<boolean, TextureReference[]>();
            const references = referencesBySemantics.get(reference.isNormalMap) ?? [];
            references.push(reference);
            referencesBySemantics.set(reference.isNormalMap, references);
            referencesByTexture.set(reference.texture, referencesBySemantics);
        }
    }

    const encodedBySource = new Map<object | string, Map<string, Promise<Uint8Array>>>();
    const sourceIndexByIdentity = new Map<object | string, number>();
    for (const [sourceTexture, referencesBySemantics] of referencesByTexture) {
        let cachedImage = await GetCachedImageAsync(sourceTexture);
        const sourceUrl = sourceTexture.url;
        const sourceMimeType = sourceTexture.mimeType ?? (sourceUrl === null ? undefined : GetMimeType(sourceUrl)) ?? "";
        if (cachedImage === null && sourceUrl !== null && sourceUrl.length > 0 && sourceMimeType.startsWith("image/")) {
            const response = await fetch(sourceUrl);
            if (!response.ok) {
                throw new Error(`Failed to load texture "${sourceUrl}": HTTP ${response.status} ${response.statusText}`.trim());
            }
            cachedImage = { data: await response.arrayBuffer(), mimeType: sourceMimeType };
        }
        if (cachedImage === null) {
            continue;
        }

        const source = new Uint8Array(cachedImage.data);
        if (cachedImage.mimeType === "image/ktx2" || isKtx2(source)) {
            continue;
        }

        const sourceIdentity = getSourceImageIdentity(sourceTexture, cachedImage.data);
        let sourceIndex = sourceIndexByIdentity.get(sourceIdentity);
        if (sourceIndex === undefined) {
            sourceIndex = sourceIndexByIdentity.size;
            sourceIndexByIdentity.set(sourceIdentity, sourceIndex);
        }
        for (const [isNormalMap, references] of referencesBySemantics) {
            const semantics = getTextureEncodingSemantics(sourceTexture.gammaSpace, isNormalMap);
            const semanticsKey = `${semantics.isPerceptual}:${semantics.isNormalMap}`;
            let encodesBySemantics = encodedBySource.get(sourceIdentity);
            if (encodesBySemantics === undefined) {
                encodesBySemantics = new Map<string, Promise<Uint8Array>>();
                encodedBySource.set(sourceIdentity, encodesBySemantics);
            }
            let encoded = encodesBySemantics.get(semanticsKey);
            if (encoded === undefined) {
                encoded = encodeToKtx2Async(source, semantics);
                encodesBySemantics.set(semanticsKey, encoded);
            }

            const compressedTexture = await createCompressedTextureAsync(Texture, scene, sourceTexture, await encoded, sourceIndex, semantics);
            for (const reference of references) {
                reference.replace(compressedTexture);
            }
        }
        sourceTexture.dispose();
    }

    return scene;
}

function getPbrTextureReferences(material: PBRMaterial): TextureReference[] {
    const references: TextureReference[] = [];
    addReference(
        references,
        () => material.albedoTexture,
        (texture) => (material.albedoTexture = texture)
    );
    addReference(
        references,
        () => material.baseWeightTexture,
        (texture) => (material.baseWeightTexture = texture)
    );
    addReference(
        references,
        () => material.baseDiffuseRoughnessTexture,
        (texture) => (material.baseDiffuseRoughnessTexture = texture)
    );
    addReference(
        references,
        () => material.ambientTexture,
        (texture) => (material.ambientTexture = texture)
    );
    addReference(
        references,
        () => material.opacityTexture,
        (texture) => (material.opacityTexture = texture)
    );
    addReference(
        references,
        () => material.reflectionTexture,
        (texture) => (material.reflectionTexture = texture)
    );
    addReference(
        references,
        () => material.emissiveTexture,
        (texture) => (material.emissiveTexture = texture)
    );
    addReference(
        references,
        () => material.reflectivityTexture,
        (texture) => (material.reflectivityTexture = texture)
    );
    addReference(
        references,
        () => material.metallicTexture,
        (texture) => (material.metallicTexture = texture)
    );
    addReference(
        references,
        () => material.metallicReflectanceTexture,
        (texture) => (material.metallicReflectanceTexture = texture)
    );
    addReference(
        references,
        () => material.reflectanceTexture,
        (texture) => (material.reflectanceTexture = texture)
    );
    addReference(
        references,
        () => material.microSurfaceTexture,
        (texture) => (material.microSurfaceTexture = texture)
    );
    addReference(
        references,
        () => material.bumpTexture,
        (texture) => (material.bumpTexture = texture),
        true
    );
    addReference(
        references,
        () => material.lightmapTexture,
        (texture) => (material.lightmapTexture = texture)
    );
    addReference(
        references,
        () => material.refractionTexture,
        (texture) => (material.refractionTexture = texture)
    );
    addReference(
        references,
        () => material.clearCoat.texture,
        (texture) => (material.clearCoat.texture = texture)
    );
    addReference(
        references,
        () => material.clearCoat.textureRoughness,
        (texture) => (material.clearCoat.textureRoughness = texture)
    );
    addReference(
        references,
        () => material.clearCoat.bumpTexture,
        (texture) => (material.clearCoat.bumpTexture = texture),
        true
    );
    addReference(
        references,
        () => material.clearCoat.tintTexture,
        (texture) => (material.clearCoat.tintTexture = texture)
    );
    addReference(
        references,
        () => material.sheen.texture,
        (texture) => (material.sheen.texture = texture)
    );
    addReference(
        references,
        () => material.sheen.textureRoughness,
        (texture) => (material.sheen.textureRoughness = texture)
    );
    addReference(
        references,
        () => material.subSurface.thicknessTexture,
        (texture) => (material.subSurface.thicknessTexture = texture)
    );
    addReference(
        references,
        () => material.subSurface.refractionTexture,
        (texture) => (material.subSurface.refractionTexture = texture)
    );
    addReference(
        references,
        () => material.subSurface.refractionIntensityTexture,
        (texture) => (material.subSurface.refractionIntensityTexture = texture)
    );
    addReference(
        references,
        () => material.subSurface.translucencyIntensityTexture,
        (texture) => (material.subSurface.translucencyIntensityTexture = texture)
    );
    addReference(
        references,
        () => material.subSurface.translucencyColorTexture,
        (texture) => (material.subSurface.translucencyColorTexture = texture)
    );
    addReference(
        references,
        () => material.iridescence.texture,
        (texture) => (material.iridescence.texture = texture)
    );
    addReference(
        references,
        () => material.iridescence.thicknessTexture,
        (texture) => (material.iridescence.thicknessTexture = texture)
    );
    addReference(
        references,
        () => material.anisotropy.texture,
        (texture) => (material.anisotropy.texture = texture)
    );
    addReference(
        references,
        () => material.detailMap.texture,
        (texture) => (material.detailMap.texture = texture)
    );
    return references;
}

function getStandardTextureReferences(material: StandardMaterial): TextureReference[] {
    const references: TextureReference[] = [];
    addReference(
        references,
        () => material.diffuseTexture,
        (texture) => (material.diffuseTexture = texture)
    );
    addReference(
        references,
        () => material.ambientTexture,
        (texture) => (material.ambientTexture = texture)
    );
    addReference(
        references,
        () => material.opacityTexture,
        (texture) => (material.opacityTexture = texture)
    );
    addReference(
        references,
        () => material.reflectionTexture,
        (texture) => (material.reflectionTexture = texture)
    );
    addReference(
        references,
        () => material.emissiveTexture,
        (texture) => (material.emissiveTexture = texture)
    );
    addReference(
        references,
        () => material.specularTexture,
        (texture) => (material.specularTexture = texture)
    );
    addReference(
        references,
        () => material.bumpTexture,
        (texture) => (material.bumpTexture = texture),
        true
    );
    addReference(
        references,
        () => material.lightmapTexture,
        (texture) => (material.lightmapTexture = texture)
    );
    addReference(
        references,
        () => material.refractionTexture,
        (texture) => (material.refractionTexture = texture)
    );
    return references;
}

function addReference(references: TextureReference[], get: () => BaseTexture | null, replace: (texture: BaseTexture) => void, isNormalMap = false): void {
    const texture = get();
    if (texture !== null) {
        references.push({ texture, isNormalMap, replace });
    }
}

function getTextureEncodingSemantics(gammaSpace: boolean, isNormalMap: boolean): TextureEncodingSemantics {
    const isPerceptual = gammaSpace && !isNormalMap;
    return {
        isNormalMap,
        isPerceptual,
        isSetKTX2SRGBTransferFunc: isPerceptual,
    };
}

function getSourceImageIdentity(texture: Texture, data: ArrayBuffer): object | string {
    const internalTexture = texture.getInternalTexture();
    return internalTexture?.url || internalTexture || data;
}

function isKtx2(source: Uint8Array): boolean {
    if (source.byteLength < KTX2_MAGIC.byteLength) {
        return false;
    }
    return KTX2_MAGIC.every((byte, index) => source[index] === byte);
}

async function encodeToKtx2Async(source: Uint8Array, semantics: TextureEncodingSemantics): Promise<Uint8Array> {
    const { encodeToKTX2 } = await import("babylonpress-ktx2-encoder");
    const options = {
        generateMipmap: true,
        ...semantics,
        isKTX2File: true,
        isUASTC: true,
    };

    if (!isNodeRuntime()) {
        return encodeToKTX2(source, options);
    }

    const sharpModuleName = "sharp";
    // Keep this Node-only dependency opaque to browser bundlers while preserving native ESM resolution.
    const { default: sharp } = (await import(/* @vite-ignore */ sharpModuleName)) as { default: typeof sharpFactory };
    return encodeToKTX2(source, {
        ...options,
        imageDecoder: async (buffer) => {
            const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            return {
                data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
                height: info.height,
                width: info.width,
            };
        },
    });
}

function isNodeRuntime(): boolean {
    return typeof process !== "undefined" && process.versions?.node !== undefined;
}

async function createCompressedTextureAsync(
    TextureConstructor: typeof Texture,
    scene: BabylonScene,
    source: Texture,
    encoded: Uint8Array,
    sourceIndex: number,
    semantics: TextureEncodingSemantics
): Promise<Texture> {
    const semanticName = semantics.isNormalMap ? "normal" : semantics.isPerceptual ? "srgb" : "linear";
    const compressed = await new Promise<Texture>((resolve, reject) => {
        const texture = new TextureConstructor(
            `node-assets-compressed-${sourceIndex}.${semanticName}.ktx2`,
            scene,
            false,
            source.invertY,
            source.samplingMode,
            () => resolve(texture),
            (message, exception) => reject(exception ?? new Error(message ?? `Failed to load KTX2 texture "${source.name}".`)),
            encoded,
            false,
            undefined,
            "image/ktx2",
            undefined,
            undefined,
            ".ktx2"
        );
    });

    copyTextureProperties(source, compressed);
    return compressed;
}

function copyTextureProperties(source: Texture, destination: Texture): void {
    destination.name = source.name ? (source.name.endsWith(".ktx2") ? source.name : `${source.name}.ktx2`) : "texture.ktx2";
    destination.metadata = source.metadata;
    destination.hasAlpha = source.hasAlpha;
    destination.getAlphaFromRGB = source.getAlphaFromRGB;
    destination.level = source.level;
    destination.coordinatesIndex = source.coordinatesIndex;
    destination.coordinatesMode = source.coordinatesMode;
    destination.wrapU = source.wrapU;
    destination.wrapV = source.wrapV;
    destination.wrapR = source.wrapR;
    destination.uOffset = source.uOffset;
    destination.vOffset = source.vOffset;
    destination.uScale = source.uScale;
    destination.vScale = source.vScale;
    destination.uAng = source.uAng;
    destination.vAng = source.vAng;
    destination.wAng = source.wAng;
    destination.uRotationCenter = source.uRotationCenter;
    destination.vRotationCenter = source.vRotationCenter;
    destination.wRotationCenter = source.wRotationCenter;
    destination.homogeneousRotationInUVTransform = source.homogeneousRotationInUVTransform;
    destination.anisotropicFilteringLevel = source.anisotropicFilteringLevel;
    destination.gammaSpace = source.gammaSpace;
}

const KTX2_MAGIC = new Uint8Array([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
