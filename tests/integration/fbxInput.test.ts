import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FbxInputBlock, GltfOutputBlock, NodeAsset, NodeAssetContext } from "../../packages/core/src/index";
import { generateBinaryFbxData, generateFbxData, generateTexturedFbxDataWithUvs } from "../helpers/fbx";
import { getEmbeddedImageBytes, parseGlbAsync } from "../helpers/glb";
import { withHttpInputsAsync, withInputFilesAsync } from "../helpers/input";
import { generateTextureData } from "../helpers/obj";

describe("FBX input", () => {
    it.each([
        { data: generateFbxData(), format: "ASCII" },
        { data: generateBinaryFbxData(), format: "binary" },
    ])("loads an extensionless HTTP $format asset", async ({ data }) => {
        await withHttpInputsAsync({ model: data }, async (rootUrl) => {
            const { json } = await parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input: `${rootUrl}model` })));

            expect(json.meshes).toHaveLength(1);
            expect(json.meshes?.[0]?.primitives).toHaveLength(1);
        });
    });

    it.each(["local", "HTTP"])("preserves an FBX material and its external PNG over %s", async (location) => {
        const files = {
            "model.fbx": generateTexturedFbxDataWithUvs("textures/diffuse.png"),
            "textures/diffuse.png": generateTextureData(),
        };
        const load = async (input: string) => {
            const parsed = await parseGlbAsync(await roundTripAsync(new FbxInputBlock({ input })));

            expect(parsed.json.meshes).toHaveLength(1);
            expect(parsed.json.materials?.[0]?.name).toBe("Textured");
            expect(parsed.json.images).toHaveLength(1);
            expect(getEmbeddedImageBytes(parsed, parsed.json.images![0]!)).toEqual(generateTextureData());
        };
        if (location === "local") {
            await withInputFilesAsync(files, (directory) => load(join(directory, "model.fbx")));
        } else {
            await withHttpInputsAsync(files, (rootUrl) => load(`${rootUrl}model.fbx`));
        }
    });

    it("accepts input through an execution context", async () => {
        await withInputFilesAsync({ "triangle.fbx": generateFbxData() }, async (directory) => {
            const source = new FbxInputBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            const asset = new NodeAsset({ name: "context-fbx-to-glb", outputBlock: destination });
            const context = new NodeAssetContext(asset);
            context.setInput(source, join(directory, "triangle.fbx"));

            const { json } = await parseGlbAsync(await asset.executeAsync(context));

            expect(json.meshes).toHaveLength(1);
        });
    });

    it.each(["local", "HTTP"])("rejects an FBX whose texture cannot be exported over %s", async (location) => {
        const files = { "model.fbx": generateTexturedFbxDataWithUvs("missing.png") };
        const load = (input: string) => expect(roundTripAsync(new FbxInputBlock({ input }))).rejects.toThrow();
        if (location === "local") {
            await withInputFilesAsync(files, (directory) => load(join(directory, "model.fbx")));
        } else {
            await withHttpInputsAsync(files, (rootUrl) => load(`${rootUrl}model.fbx`));
        }
    });
});

async function roundTripAsync(source: FbxInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "fbx-roundtrip", outputBlock: destination }).executeAsync();
}
