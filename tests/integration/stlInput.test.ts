import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GltfOutputBlock, NodeAsset, NodeAssetContext, StlInputBlock } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { withHttpInputsAsync, withInputFilesAsync } from "../helpers/input";
import { generateBinaryStlData, generateStlData } from "../helpers/stl";

describe("STL input", () => {
    it.each([1, 20_000])("loads a local binary STL containing %i triangles", async (triangleCount) => {
        await withInputFilesAsync({ "triangles.stl": generateBinaryStlData(triangleCount) }, async (directory) => {
            const document = await new NodeAsset({
                name: "local-binary-stl",
                outputBlock: new StlInputBlock({ input: join(directory, "triangles.stl") }),
            }).executeAsync();

            const meshes = document.getRoot().listMeshes();
            expect(meshes).toHaveLength(1);
            expect(meshes[0]?.listPrimitives()[0]?.getAttribute("POSITION")?.getCount()).toBe(triangleCount * 3);
        });
    });

    it.each([
        { data: generateStlData(), format: "ASCII" },
        { data: generateBinaryStlData(), format: "binary" },
    ])("loads an extensionless HTTP $format asset", async ({ data }) => {
        await withHttpInputsAsync({ model: data }, async (rootUrl) => {
            const { json } = await parseGlbAsync(await roundTripAsync(new StlInputBlock({ input: `${rootUrl}model` })));

            expect(json.meshes).toHaveLength(1);
            expect(json.meshes?.[0]?.primitives).toHaveLength(1);
        });
    });

    it("accepts input through an execution context", async () => {
        await withInputFilesAsync({ "triangle.stl": generateStlData() }, async (directory) => {
            const source = new StlInputBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(destination.input);
            const asset = new NodeAsset({ name: "context-stl-to-glb", outputBlock: destination });
            const context = new NodeAssetContext(asset);
            context.setInput(source, join(directory, "triangle.stl"));

            const { json } = await parseGlbAsync(await asset.executeAsync(context));

            expect(json.meshes).toHaveLength(1);
        });
    });
});

async function roundTripAsync(source: StlInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "stl-roundtrip", outputBlock: destination }).executeAsync();
}
