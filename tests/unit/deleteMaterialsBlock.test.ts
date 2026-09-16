import { Document } from "@gltf-transform/core";
import { EXTMeshFeatures, KHRMaterialsClearcoat, KHRMaterialsVariants, KHRTextureBasisu, KHRTextureTransform, KHRXMP } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";

import { DeleteMaterialsBlock, NodeAsset } from "../../src/index";

describe("DeleteMaterialsBlock", () => {
    it("removes every material and only textures made unused by their deletion", async () => {
        const { document, primitive } = createDocument();
        const removedTexture = document.createTexture("removed");
        const preexistingUnusedTexture = document.createTexture("preexisting-unused");
        const firstMaterial = document.createMaterial("first").setBaseColorTexture(removedTexture);
        document.createMaterial("second").setEmissiveTexture(removedTexture);
        primitive.setMaterial(firstMaterial);

        const position = primitive.getAttribute("POSITION");
        const texCoord = primitive.getAttribute("TEXCOORD_0");
        const color = primitive.getAttribute("COLOR_0");
        const indices = primitive.getIndices();
        const block = new DeleteMaterialsBlock({ input: document });

        const result = await new NodeAsset({ name: "delete-materials", outputBlock: block }).executeAsync();

        expect(result).toBe(document);
        expect(document.getRoot().listMaterials()).toEqual([]);
        expect(primitive.getMaterial()).toBeNull();
        expect(document.getRoot().listTextures()).toEqual([preexistingUnusedTexture]);
        expect(primitive.getAttribute("POSITION")).toBe(position);
        expect(primitive.getAttribute("TEXCOORD_0")).toBe(texCoord);
        expect(primitive.getAttribute("COLOR_0")).toBe(color);
        expect(primitive.getIndices()).toBe(indices);
    });

    it("removes material extension resources while preserving surviving texture uses", async () => {
        const { document, node, primitive } = createDocument();
        const sharedTexture = document.createTexture("shared");
        const extensionTexture = document
            .createTexture("clearcoat")
            .setImage(new Uint8Array([1, 2, 3]))
            .setMimeType("image/ktx2");
        const material = document.createMaterial("material").setBaseColorTexture(sharedTexture);
        primitive.setMaterial(material);

        document.createExtension(KHRTextureBasisu).setRequired(true);
        const clearcoatExtension = document.createExtension(KHRMaterialsClearcoat);
        const clearcoat = clearcoatExtension.createClearcoat().setClearcoatTexture(extensionTexture);
        material.setExtension(KHRMaterialsClearcoat.EXTENSION_NAME, clearcoat);
        const clearcoatTextureInfo = clearcoat.getClearcoatTextureInfo()!;
        const textureTransformExtension = document.createExtension(KHRTextureTransform);
        clearcoatTextureInfo.setExtension(KHRTextureTransform.EXTENSION_NAME, textureTransformExtension.createTransform().setOffset([0.5, 0.5]));

        const variantsExtension = document.createExtension(KHRMaterialsVariants);
        const variant = variantsExtension.createVariant("variant");
        const mapping = variantsExtension.createMapping().setMaterial(material).addVariant(variant);
        primitive.setExtension(KHRMaterialsVariants.EXTENSION_NAME, variantsExtension.createMappingList().addMapping(mapping));

        const meshFeaturesExtension = document.createExtension(EXTMeshFeatures);
        const featureTexture = meshFeaturesExtension.createFeatureIDTexture().setTexture(sharedTexture);
        const featureId = meshFeaturesExtension.createFeatureID().setFeatureCount(1).setTexture(featureTexture);
        primitive.setExtension(EXTMeshFeatures.EXTENSION_NAME, meshFeaturesExtension.createFeatures().addFeatureID(featureId));

        const xmpExtension = document.createExtension(KHRXMP);
        const packet = xmpExtension.createPacket();
        const texturePacket = xmpExtension.createPacket();
        material.setExtension(KHRXMP.EXTENSION_NAME, packet);
        node.setExtension(KHRXMP.EXTENSION_NAME, packet);
        extensionTexture.setExtension(KHRXMP.EXTENSION_NAME, texturePacket);

        const block = new DeleteMaterialsBlock({ input: document });
        await new NodeAsset({ name: "delete-material-extensions", outputBlock: block }).executeAsync();

        expect(document.getRoot().listTextures()).toEqual([sharedTexture]);
        expect(extensionTexture.getImage()).toBeNull();
        expect(primitive.getExtension(KHRMaterialsVariants.EXTENSION_NAME)).toBeNull();
        expect(primitive.getExtension(EXTMeshFeatures.EXTENSION_NAME)).not.toBeNull();
        expect(node.getExtension(KHRXMP.EXTENSION_NAME)).toBe(packet);
        expect(xmpExtension.listPackets()).toEqual([packet]);
        expect(document.getRoot().listExtensionsUsed()).toEqual([meshFeaturesExtension, xmpExtension]);
        expect(document.getRoot().listExtensionsRequired()).toEqual([]);
    });

    it("supports material-free documents and repeated execution", async () => {
        const document = new Document();
        const preexistingUnusedTexture = document.createTexture("preexisting-unused").setMimeType("image/ktx2");
        const textureExtension = document.createExtension(KHRTextureBasisu).setRequired(true);
        const block = new DeleteMaterialsBlock({ input: document });
        const asset = new NodeAsset({ name: "delete-no-materials", outputBlock: block });

        await expect(asset.executeAsync()).resolves.toBe(document);
        await expect(asset.executeAsync()).resolves.toBe(document);
        expect(document.getRoot().listTextures()).toEqual([preexistingUnusedTexture]);
        expect(document.getRoot().listExtensionsUsed()).toEqual([textureExtension]);
        expect(document.getRoot().listExtensionsRequired()).toEqual([textureExtension]);
    });
});

function createDocument(): {
    document: Document;
    node: ReturnType<Document["createNode"]>;
    primitive: ReturnType<Document["createPrimitive"]>;
} {
    const document = new Document();
    const buffer = document.createBuffer();
    const position = document
        .createAccessor("position", buffer)
        .setType("VEC3")
        .setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    const texCoord = document
        .createAccessor("texcoord", buffer)
        .setType("VEC2")
        .setArray(new Float32Array([0, 0, 1, 0, 0, 1]));
    const color = document
        .createAccessor("color", buffer)
        .setType("VEC4")
        .setArray(new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]));
    const indices = document
        .createAccessor("indices", buffer)
        .setType("SCALAR")
        .setArray(new Uint16Array([0, 1, 2]));
    const primitive = document.createPrimitive().setAttribute("POSITION", position).setAttribute("TEXCOORD_0", texCoord).setAttribute("COLOR_0", color).setIndices(indices);
    const mesh = document.createMesh().addPrimitive(primitive);
    const node = document.createNode().setMesh(mesh);
    document.createScene().addChild(node);
    return { document, node, primitive };
}
