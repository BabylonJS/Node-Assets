import { type Document, ExtensionProperty, type Property, Texture, TextureInfo } from "@gltf-transform/core";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { Block, type BlockOptions } from "./block";
import { defineBlock } from "./blockDefinition";

const DeleteMaterialsBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.delete-materials",
    input: GltfDocumentType,
    output: GltfDocumentType,
    run: deleteMaterials,
});

/** Options for naming the block or supplying its initial input. */
export type DeleteMaterialsBlockOptions = BlockOptions<typeof DeleteMaterialsBlockDefinition>;

/** Removes every material, material assignment, and texture made unused by their removal. */
export class DeleteMaterialsBlock extends Block<typeof DeleteMaterialsBlockDefinition> {
    public constructor(options?: DeleteMaterialsBlockOptions) {
        super(DeleteMaterialsBlockDefinition, options);
    }
}

function deleteMaterials(document: Document): Document {
    const root = document.getRoot();
    const graph = document.getGraph();
    const materials = root.listMaterials();
    const materialSet = new Set<Property>(materials);
    const descendantExtensionProperties = new Set<ExtensionProperty>();
    const affectedExtensionNames = new Set<string>();
    const affectedTextureExtensionNames = new Set<string>();
    const candidateTextures = new Set<Texture>();
    const pending: Property[] = [...materials];
    const visited = new Set<Property>();
    let hasMaterialVariants = false;

    while (pending.length > 0) {
        const property = pending.pop();
        if (property === undefined || visited.has(property)) {
            continue;
        }
        visited.add(property);

        for (const edge of graph.listChildEdges(property)) {
            const child = edge.getChild();
            if (child instanceof Texture) {
                candidateTextures.add(child);
                pending.push(child);
            } else if (child instanceof ExtensionProperty) {
                descendantExtensionProperties.add(child);
                affectedExtensionNames.add(child.extensionName);
                pending.push(child);
            } else if (child instanceof TextureInfo) {
                pending.push(child);
            }
        }

        if (materialSet.has(property)) {
            for (const edge of graph.listParentEdges(property)) {
                const parent = edge.getParent();
                if (parent instanceof ExtensionProperty && parent.extensionName === "KHR_materials_variants") {
                    hasMaterialVariants = true;
                }
            }
        }
    }

    materials.forEach((material) => material.dispose());
    disposeOrphanedExtensionProperties(descendantExtensionProperties);

    if (hasMaterialVariants) {
        root.listExtensionsUsed()
            .find((extension) => extension.extensionName === "KHR_materials_variants")
            ?.dispose();
    }

    for (const texture of candidateTextures) {
        if (texture.listParents().every((parent) => parent === root)) {
            const textureExtensionName = getTextureExtensionName(texture.getMimeType());
            if (textureExtensionName !== undefined) {
                affectedTextureExtensionNames.add(textureExtensionName);
            }
            texture.setImage(null).setURI("").setMimeType("").dispose();
        }
    }
    disposeOrphanedExtensionProperties(descendantExtensionProperties);

    for (const extension of root.listExtensionsUsed()) {
        const hasNoProperties = affectedExtensionNames.has(extension.extensionName) && extension.listProperties().length === 0;
        const hasNoTextures = affectedTextureExtensionNames.has(extension.extensionName) && !isTextureExtensionInUse(extension.extensionName, root.listTextures());
        if (hasNoProperties || hasNoTextures) {
            extension.dispose();
        }
    }

    return document;
}

function disposeOrphanedExtensionProperties(properties: Set<ExtensionProperty>): void {
    let disposedProperty = true;
    while (disposedProperty) {
        disposedProperty = false;
        for (const property of properties) {
            if (property.isDisposed()) {
                properties.delete(property);
            } else if (property.listParents().length === 0) {
                property.dispose();
                properties.delete(property);
                disposedProperty = true;
            }
        }
    }
}

function getTextureExtensionName(mimeType: string): string | undefined {
    switch (mimeType) {
        case "image/avif":
            return "EXT_texture_avif";
        case "image/ktx2":
            return "KHR_texture_basisu";
        case "image/webp":
            return "EXT_texture_webp";
        default:
            return undefined;
    }
}

function isTextureExtensionInUse(extensionName: string, textures: readonly Texture[]): boolean {
    return textures.some((texture) => getTextureExtensionName(texture.getMimeType()) === extensionName);
}
