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
    const affectedExtensionProperties = new Set<ExtensionProperty>();
    const affectedExtensionNames = new Set<string>();
    const candidateTextures = new Set<Texture>();
    const pending: Property[] = [...materials];
    const visited = new Set<Property>();

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
            } else if (child instanceof ExtensionProperty) {
                affectedExtensionProperties.add(child);
                affectedExtensionNames.add(child.extensionName);
                pending.push(child);
            } else if (child instanceof TextureInfo) {
                pending.push(child);
            }
        }

        for (const edge of graph.listParentEdges(property)) {
            const parent = edge.getParent();
            if (parent instanceof ExtensionProperty) {
                affectedExtensionProperties.add(parent);
                affectedExtensionNames.add(parent.extensionName);
                pending.push(parent);
            }
        }
    }

    materials.forEach((material) => material.dispose());
    affectedExtensionProperties.forEach((property) => property.dispose());

    for (const extension of root.listExtensionsUsed()) {
        if (affectedExtensionNames.has(extension.extensionName) && extension.listProperties().length === 0) {
            extension.dispose();
        }
    }

    for (const texture of candidateTextures) {
        if (texture.listParents().every((parent) => parent === root)) {
            texture.dispose();
        }
    }

    return document;
}
