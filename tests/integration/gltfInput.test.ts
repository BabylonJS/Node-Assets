import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { GltfInputBlock, NodeAsset, NodeAssetContext } from "../../packages/core/src/index";
import { generateGlbData, generateGltfJson, generateTexturedGltfJson } from "../helpers/gltf";
import { withHttpInputsAsync, withInputFilesAsync } from "../helpers/input";
import { generateTextureData } from "../helpers/obj";

describe("glTF input", () => {
    it.each(["local", "HTTP"])("loads glTF external buffers and textures over %s", async (location) => {
        const json = JSON.parse(generateTexturedGltfJson()) as { buffers: [{ uri: string }]; images: [{ uri: string }] };
        const bufferUri = json.buffers[0].uri;
        const geometry = Buffer.from(bufferUri.slice(bufferUri.indexOf(",") + 1), "base64");
        json.buffers[0].uri = "geometry.bin";
        json.images[0].uri = "textures/diffuse.png";
        const files = {
            "model.gltf": JSON.stringify(json),
            "geometry.bin": geometry,
            "textures/diffuse.png": generateTextureData(),
        };
        const load = async (input: string) => {
            const document = await new NodeAsset({ name: "gltf-sidecars", outputBlock: new GltfInputBlock({ input }) }).executeAsync();

            expect(document.getRoot().listMeshes()).toHaveLength(1);
            expect(document.getRoot().listTextures()).toHaveLength(1);
            expect(Uint8Array.from(document.getRoot().listTextures()[0]!.getImage()!)).toEqual(generateTextureData());
        };
        if (location === "local") {
            await withInputFilesAsync(files, (directory) => load(pathToFileURL(join(directory, "model.gltf")).href));
        } else {
            await withHttpInputsAsync(files, (rootUrl) => load(`${rootUrl}model.gltf`));
        }
    });

    it.each([
        { body: generateGltfJson(), format: "glTF", url: "https://example.com/model.gltf" },
        { body: generateGlbData(), format: "GLB", url: "https://example.com/model.glb" },
    ])("loads $format through PlatformIO", async ({ body, url }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(body)))
        );

        try {
            const document = await new NodeAsset({ name: "gltf-input", outputBlock: new GltfInputBlock({ input: url }) }).executeAsync();

            expect(document.getRoot().listMeshes()).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accepts input through an execution context", async () => {
        const url = "https://example.com/model.gltf";
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );

        try {
            const source = new GltfInputBlock();
            const asset = new NodeAsset({ name: "context-gltf-input", outputBlock: source });
            const context = new NodeAssetContext(asset);
            context.setInput(source, url);

            const document = await asset.executeAsync(context);

            expect(document.getRoot().listMeshes()).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
