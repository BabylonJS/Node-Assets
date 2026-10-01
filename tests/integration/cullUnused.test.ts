import { describe, expect, it, vi } from "vitest";

import { CullUnusedBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson } from "../helpers/gltf";

describe("unused resource culling", () => {
    it("removes unused resources from connected glTF output", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfWithUnusedMaterialJson())))
        );

        try {
            const source = new GltfInputBlock({ input: url });
            const cullUnused = new CullUnusedBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(cullUnused.input);
            cullUnused.output.connectTo(destination.input);

            const parsed = await parseGlbAsync(await new NodeAsset({ name: "culled-glb", outputBlock: destination }).executeAsync());
            const primitive = parsed.json.meshes?.[0]?.primitives[0];

            expect(parsed.json.materials?.map(({ name }) => name)).toEqual(["used"]);
            expect(primitive?.material).toBe(0);
            expect(primitive?.attributes).toEqual({ NORMAL: 1, POSITION: 0 });
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function generateGltfWithUnusedMaterialJson(): string {
    const gltf = JSON.parse(generateGltfJson()) as {
        materials?: Array<{ name: string }>;
        meshes: Array<{ primitives: Array<{ material?: number }> }>;
    };

    gltf.materials = [{ name: "used" }, { name: "unused" }];
    gltf.meshes[0]!.primitives[0]!.material = 0;
    return JSON.stringify(gltf);
}
