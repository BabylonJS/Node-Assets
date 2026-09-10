import { describe, expect, it, vi } from "vitest";

import { Block } from "../../src/block/block";
import { defineBlock } from "../../src/block/blockDefinition";
import { BabylonSceneType } from "../../src/block/connectionPointType";
import { GltfOutputBlock, NodeAsset, NodeAssetContext, ObjInputBlock } from "../../src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateMtlData, generateObjDataUri, generateObjData, generateTexturedObjData, generateTextureData } from "../helpers/obj";

describe("OBJ input", () => {
    it("loads generated OBJ data from a data URI", async () => {
        const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: generateObjDataUri() })));

        expect(json.meshes).toHaveLength(1);
        expect(json.meshes?.[0]?.primitives).toHaveLength(1);
    });

    it("loads an extensionless HTTP asset", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateObjData(), { headers: { "content-type": "text/plain" } })))
        );

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: "https://example.com/model" })));

            expect(json.meshes).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("resolves relative MTL and texture dependencies and preserves the material", async () => {
        const rootUrl = "https://example.com/assets/model";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        const textureUrl = "https://example.com/assets/materials/textures/diffuse.png";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            switch (String(input)) {
                case rootUrl:
                    return Promise.resolve(new Response(generateTexturedObjData(), { headers: { "content-type": "text/plain" } }));
                case mtlUrl:
                    return Promise.resolve(new Response(generateMtlData(), { headers: { "content-type": "text/plain" } }));
                case textureUrl:
                    return Promise.resolve(new Response(generateTextureData().buffer as ArrayBuffer));
                default:
                    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            }
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: rootUrl })));

            expect(json.meshes).toHaveLength(1);
            expect(json.materials).toHaveLength(1);
            expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toBeDefined();
            expect(json.materials?.[0]?.normalTexture).toBeDefined();
            expect(json.images).toHaveLength(1);
            expect(json.images?.[0]?.name).toBe(textureUrl);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("preserves Unicode material names", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const materialName = "Mät";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            if (String(input) === rootUrl) {
                return Promise.resolve(new Response(generateTexturedObjData("model.mtl", materialName)));
            }
            if (String(input) === mtlUrl) {
                return Promise.resolve(
                    new Response(`newmtl ${materialName}
Kd 1 1 1`)
                );
            }
            return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: rootUrl })));

            expect(json.materials?.[0]?.name).toBe(materialName);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("restores material names and IDs for face and line materials", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const materialName = "Mät";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            if (String(input) === rootUrl) {
                return Promise.resolve(
                    new Response(`mtllib model.mtl
o Face
v 0 0 0
v 1 0 0
v 0 1 0
usemtl ${materialName}
f 1 2 3
o Line
usemtl ${materialName}
l 1 2`)
                );
            }
            if (String(input) === mtlUrl) {
                return Promise.resolve(
                    new Response(`newmtl ${materialName}
Kd 1 1 1`)
                );
            }
            return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            let materialIdentifiers: ReadonlyArray<{ readonly id: string; readonly name: string }> = [];
            const source = new ObjInputBlock({ input: rootUrl });
            const inspector = new Block(
                defineBlock({
                    type: "test.inspect-obj-materials",
                    input: BabylonSceneType,
                    output: BabylonSceneType,
                    run: (scene) => {
                        materialIdentifiers = scene.materials.map(({ id, name }) => ({ id, name }));
                        return scene;
                    },
                })
            );
            source.output.connectTo(inspector.input);
            await new NodeAsset({ name: "obj-material-restoration", outputBlock: inspector }).executeAsync();

            expect(materialIdentifiers).toEqual(
                expect.arrayContaining([
                    { id: materialName, name: materialName },
                    { id: `${materialName}_line`, name: `${materialName}_line` },
                ])
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("loads geometry that references an undefined material", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            if (String(input) === rootUrl) {
                return Promise.resolve(new Response(generateTexturedObjData("model.mtl", "Missing")));
            }
            if (String(input) === mtlUrl) {
                return Promise.resolve(
                    new Response(`newmtl Defined
Kd 1 1 1`)
                );
            }
            return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: rootUrl })));

            expect(json.meshes).toHaveLength(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("accepts input through an execution context", async () => {
        const source = new ObjInputBlock();
        const destination = new GltfOutputBlock();
        source.output.connectTo(destination.input);
        const asset = new NodeAsset({ name: "context-obj-to-glb", outputBlock: destination });
        const context = new NodeAssetContext(asset);
        context.setInput(source, generateObjDataUri());

        const { json } = await parseGlbAsync(await asset.executeAsync(context));

        expect(json.meshes).toHaveLength(1);
    });

    it("fails when the MTL dependency is missing", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            if (String(input) === rootUrl) {
                return Promise.resolve(new Response(generateTexturedObjData("model.mtl")));
            }
            if (String(input) === mtlUrl) {
                return Promise.resolve(new Response("", { status: 404, statusText: "Not Found" }));
            }
            return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(roundTripAsync(new ObjInputBlock({ input: rootUrl }))).rejects.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("fails when a texture dependency is missing", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const textureUrl = "https://example.com/textures/diffuse.png";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            switch (String(input)) {
                case rootUrl:
                    return Promise.resolve(new Response(generateTexturedObjData("model.mtl")));
                case mtlUrl:
                    return Promise.resolve(new Response(generateMtlData(), { headers: { "content-type": "text/plain" } }));
                case textureUrl:
                    return Promise.resolve(new Response("", { status: 404, statusText: "Not Found" }));
                default:
                    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            }
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(roundTripAsync(new ObjInputBlock({ input: rootUrl }))).rejects.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("fails when a texture dependency has invalid image data", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const textureUrl = "https://example.com/textures/diffuse.png";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            switch (String(input)) {
                case rootUrl:
                    return Promise.resolve(new Response(generateTexturedObjData("model.mtl")));
                case mtlUrl:
                    return Promise.resolve(new Response(generateMtlData()));
                case textureUrl:
                    return Promise.resolve(new Response("not an image", { headers: { "content-type": "image/png" } }));
                default:
                    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            }
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(roundTripAsync(new ObjInputBlock({ input: rootUrl }))).rejects.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("fails when a recognized MTL texture directive has no path", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const fetchMock = vi.fn((input: string | URL | Request) => {
            if (String(input) === rootUrl) {
                return Promise.resolve(new Response(generateTexturedObjData("model.mtl")));
            }
            if (String(input) === mtlUrl) {
                return Promise.resolve(
                    new Response(`newmtl Textured
map_Kd`)
                );
            }
            return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(roundTripAsync(new ObjInputBlock({ input: rootUrl }))).rejects.toThrow();
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it("aborts sibling texture fetches after a dependency fails", async () => {
        const rootUrl = "https://example.com/model";
        const mtlUrl = "https://example.com/model.mtl";
        const slowTextureUrl = "https://example.com/slow.png";
        const failedTextureUrl = "https://example.com/fail.png";
        let slowFetchWasAborted = false;
        const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
            switch (String(input)) {
                case rootUrl:
                    return Promise.resolve(new Response(generateTexturedObjData("model.mtl")));
                case mtlUrl:
                    return Promise.resolve(
                        new Response(
                            `newmtl Textured
map_Kd slow.png
map_Ks fail.png`,
                            { headers: { "content-type": "text/plain" } }
                        )
                    );
                case failedTextureUrl:
                    return Promise.resolve(new Response("", { status: 500, statusText: "Failed" }));
                case slowTextureUrl:
                    return new Promise<Response>((_resolve, reject) => {
                        const timeout = setTimeout(() => reject(new Error("slow texture was not aborted")), 100);
                        init?.signal?.addEventListener(
                            "abort",
                            () => {
                                clearTimeout(timeout);
                                slowFetchWasAborted = true;
                                reject(init.signal?.reason);
                            },
                            { once: true }
                        );
                    });
                default:
                    return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            }
        });
        vi.stubGlobal("fetch", fetchMock);

        try {
            await expect(roundTripAsync(new ObjInputBlock({ input: rootUrl }))).rejects.toThrow();
            expect(slowFetchWasAborted).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

async function roundTripAsync(source: ObjInputBlock): Promise<File> {
    const destination = new GltfOutputBlock();
    source.output.connectTo(destination.input);
    return new NodeAsset({ name: "obj-roundtrip", outputBlock: destination }).executeAsync();
}
