import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { FbxInputBlock, GltfInputBlock, NodeAsset, ObjInputBlock, StlInputBlock } from "../../packages/core/src/index";
import { generateFbxData } from "../helpers/fbx";
import { generateGltfJson } from "../helpers/gltf";
import { withHttpInputsAsync, withInputFilesAsync } from "../helpers/input";
import { generateObjData } from "../helpers/obj";
import { generateStlData } from "../helpers/stl";

describe("input locations", () => {
    it.each([
        { Block: GltfInputBlock, data: generateGltfJson(), extension: "gltf" },
        { Block: StlInputBlock, data: generateStlData(), extension: "stl" },
        { Block: ObjInputBlock, data: generateObjData(), extension: "obj" },
        { Block: FbxInputBlock, data: generateFbxData(), extension: "fbx" },
    ])("loads $extension paths and file URLs containing reserved characters", async ({ Block, data, extension }) => {
        const name = `model #100%.${extension}`;
        await withInputFilesAsync({ [name]: data }, async (directory) => {
            const path = join(directory, name);
            for (const input of [path, relative(process.cwd(), path), pathToFileURL(path).href]) {
                const document = await new NodeAsset({ name: "input-location", outputBlock: new Block({ input }) }).executeAsync();

                expect(document.getRoot().listMeshes()).toHaveLength(1);
            }
        });
    });

    it.each([
        { Block: GltfInputBlock, data: generateGltfJson(), format: "glTF" },
        { Block: StlInputBlock, data: generateStlData(), format: "STL" },
        { Block: ObjInputBlock, data: generateObjData(), format: "OBJ" },
        { Block: FbxInputBlock, data: generateFbxData(), format: "FBX" },
    ])("loads $format through relative HTTP redirect chains", async ({ Block, data }) => {
        await withHttpInputsAsync(
            {
                start: { redirect: "/redirects/step" },
                "redirects/step": { redirect: "next" },
                "redirects/next": { redirect: "../assets/model" },
                "assets/model": data,
            },
            async (rootUrl) => {
                const document = await new NodeAsset({ name: "redirected-input", outputBlock: new Block({ input: `${rootUrl}start` }) }).executeAsync();

                expect(document.getRoot().listMeshes()).toHaveLength(1);
            }
        );
    });

    it.each([GltfInputBlock, StlInputBlock, ObjInputBlock, FbxInputBlock])("rejects missing local and HTTP inputs with %s", async (Block) => {
        await withInputFilesAsync({}, async (directory) => {
            await expect(new NodeAsset({ name: "missing-file", outputBlock: new Block({ input: join(directory, "missing") }) }).executeAsync()).rejects.toThrow();
        });
        await withHttpInputsAsync({}, async (rootUrl) => {
            await expect(new NodeAsset({ name: "missing-url", outputBlock: new Block({ input: `${rootUrl}missing` }) }).executeAsync()).rejects.toThrow();
        });
    });

    it("loads independent local inputs concurrently", async () => {
        vi.stubGlobal("XMLHttpRequest", undefined);
        try {
            await withInputFilesAsync({ "model.stl": generateStlData(), "model.fbx": generateFbxData() }, async (directory) => {
                const documents = await Promise.all([
                    new NodeAsset({ name: "concurrent-stl", outputBlock: new StlInputBlock({ input: join(directory, "model.stl") }) }).executeAsync(),
                    new NodeAsset({ name: "concurrent-fbx", outputBlock: new FbxInputBlock({ input: join(directory, "model.fbx") }) }).executeAsync(),
                ]);

                expect(documents.map((document) => document.getRoot().listMeshes().length)).toEqual([1, 1]);
            });
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("preserves a host-provided HTTP transport", async () => {
        await withInputFilesAsync({ "model.stl": generateStlData() }, async (directory) => {
            await new NodeAsset({ name: "initialize-node", outputBlock: new StlInputBlock({ input: join(directory, "model.stl") }) }).executeAsync();
        });
        await withHttpInputsAsync({ model: generateStlData() }, async (rootUrl) => {
            class HostRequest extends globalThis.XMLHttpRequest {
                public override open(method: string, _url: string | URL): void {
                    super.open(method, `${rootUrl}model`, true);
                }
            }
            vi.stubGlobal("XMLHttpRequest", HostRequest);
            try {
                const document = await new NodeAsset({
                    name: "host-transport",
                    outputBlock: new StlInputBlock({ input: `${rootUrl}missing` }),
                }).executeAsync();

                expect(document.getRoot().listMeshes()).toHaveLength(1);
            } finally {
                vi.unstubAllGlobals();
            }
        });
    });
});
