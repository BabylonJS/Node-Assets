import { describe, expect, it, vi } from "vitest";

import { GltfOutputBlock, NodeAsset, ObjInputBlock } from "../../src/index";
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

    it("preserves repeated material references with CRLF line endings", async () => {
        const materialName = "Repeated Material";
        const obj = [
            "mtllib materials/model.mtl",
            "o Triangle",
            "v 0 0 0",
            "v 1 0 0",
            "v 0 1 0",
            "vn 0 0 1",
            ...Array.from({ length: 512 }, () => `  usemtl ${materialName}\r\nf 1//1 2//1 3//1`),
        ].join("\r\n");
        const rootUrl = "https://example.com/assets/model.obj";
        const mtlUrl = "https://example.com/assets/materials/model.mtl";
        vi.stubGlobal(
            "fetch",
            vi.fn((input: string | URL | Request) => {
                if (String(input) === rootUrl) {
                    return Promise.resolve(new Response(obj, { headers: { "content-type": "text/plain" } }));
                }
                if (String(input) === mtlUrl) {
                    return Promise.resolve(new Response(`newmtl ${materialName}\r\nKd 1 1 1`, { headers: { "content-type": "text/plain" } }));
                }
                return Promise.reject(new Error(`Unexpected fetch: ${String(input)}`));
            })
        );

        try {
            const { json } = await parseGlbAsync(await roundTripAsync(new ObjInputBlock({ input: rootUrl })));

            expect(json.meshes).toHaveLength(512);
            expect(json.materials?.[0]?.name).toBe(materialName);
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
