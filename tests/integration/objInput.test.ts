import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../packages/core/src/index";
import { getEmbeddedImageBytes, parseGlbAsync } from "../helpers/glb";
import { withHttpInputsAsync, withInputFilesAsync } from "../helpers/input";
import { generateMtlData, generateObjData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

describe("OBJ input", () => {
    it("loads a local OBJ with its MTL and texture dependencies", async () => {
        await withInputFilesAsync(
            {
                "model.obj": generateTexturedObjData("model.mtl"),
                "model.mtl": generateMtlData(),
                "textures/diffuse.png": generateTextureData(),
            },
            async (directory) => {
                const parsed = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: join(directory, "model.obj") })));

                expect(parsed.json.materials?.[0]?.name).toBe("Textured");
                expect(parsed.json.images).toHaveLength(1);
                expect(getEmbeddedImageBytes(parsed, parsed.json.images![0]!)).toEqual(generateTextureData());
            }
        );
    });

    it("loads an extensionless HTTP asset", async () => {
        await withHttpInputsAsync({ model: generateObjData() }, async (rootUrl) => {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: `${rootUrl}model` })));

            expect(json.meshes).toHaveLength(1);
        });
    });

    it.each(["local", "HTTP"])("rejects a missing MTL over %s", async (location) => {
        const files = { "model.obj": generateTexturedObjData("missing.mtl") };
        const load = (input: string) => expect(roundTripAsync(new ObjInputBlock({ input }))).rejects.toThrow();
        if (location === "local") {
            await withInputFilesAsync(files, (directory) => load(join(directory, "model.obj")));
        } else {
            await withHttpInputsAsync(files, (rootUrl) => load(`${rootUrl}model.obj`));
        }
    });

    it("resolves relative MTL and texture dependencies and preserves the material", async () => {
        await withHttpInputsAsync(
            {
                "assets/model": generateTexturedObjData("model.mtl"),
                "assets/model.mtl": generateMtlData(),
                "assets/textures/diffuse.png": generateTextureData(),
            },
            async (rootUrl) => {
                const parsed = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: `${rootUrl}assets/model` })));
                const { json } = parsed;

                expect(json.meshes).toHaveLength(1);
                expect(json.materials).toHaveLength(1);
                expect(json.materials?.[0]?.name).toBe("Textured");
                expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toBeDefined();
                expect(json.materials?.[0]?.normalTexture).toBeDefined();
                expect(json.images).toHaveLength(1);
                expect(getEmbeddedImageBytes(parsed, json.images![0]!)).toEqual(generateTextureData());
            }
        );
    });
});

async function roundTripAsync(source: ObjInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "obj-roundtrip", outputBlock: destination }).executeAsync();
}
