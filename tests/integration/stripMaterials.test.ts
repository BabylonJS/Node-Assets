import { describe, expect, it, vi } from "vitest";

import { GltfInputBlock, GltfOutputBlock, NodeAsset, StripMaterialsBlock } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson, generateTexturedGltfJson } from "../helpers/gltf";

describe("material stripping", () => {
    it("removes materials, assignments, and newly unused texture data from connected glTF output", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateExtendedMaterialGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const stripMaterials = new StripMaterialsBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(stripMaterials.input);
            stripMaterials.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "material-free-glb", outputBlock: destination }).executeAsync());
            const primitive = parsed.json.meshes?.[0]?.primitives[0];

            expect(parsed.json.materials).toBeUndefined();
            expect(parsed.json.textures).toBeUndefined();
            expect(parsed.json.images).toBeUndefined();
            expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_materials_clearcoat");
            expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_materials_variants");
            expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_texture_transform");
            expect(parsed.json.extensions?.KHR_materials_variants).toBeUndefined();
            expect(primitive?.material).toBeUndefined();
            expect(primitive?.extensions?.KHR_materials_variants).toBeUndefined();
            expect(primitive?.attributes).toEqual({ NORMAL: 1, POSITION: 0, TEXCOORD_0: 2 });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("round trips material-free input without changing geometry", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const stripMaterials = new StripMaterialsBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(stripMaterials.input);
            stripMaterials.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "already-material-free-glb", outputBlock: destination }).executeAsync());

            expect(parsed.json.materials).toBeUndefined();
            expect(parsed.json.meshes?.[0]?.primitives[0]?.attributes).toEqual({ NORMAL: 1, POSITION: 0 });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function generateExtendedMaterialGltfJson(): string {
    const gltf = JSON.parse(generateTexturedGltfJson()) as {
        extensions?: Record<string, unknown>;
        extensionsUsed?: string[];
        materials: Array<{ extensions?: Record<string, unknown> }>;
        meshes: Array<{ primitives: Array<{ extensions?: Record<string, unknown> }> }>;
    };

    gltf.extensionsUsed = ["KHR_materials_clearcoat", "KHR_materials_variants", "KHR_texture_transform"];
    gltf.extensions = {
        KHR_materials_variants: {
            variants: [{ name: "Alternate" }],
        },
    };
    gltf.materials[0]!.extensions = {
        KHR_materials_clearcoat: {
            clearcoatFactor: 1,
            clearcoatTexture: {
                index: 0,
                extensions: {
                    KHR_texture_transform: {
                        offset: [0.5, 0.5],
                    },
                },
            },
        },
    };
    gltf.meshes[0]!.primitives[0]!.extensions = {
        KHR_materials_variants: {
            mappings: [{ material: 0, variants: [0] }],
        },
    };
    return JSON.stringify(gltf);
}
