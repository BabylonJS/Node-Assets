import { NodeIO } from "@gltf-transform/core";
import { KHRMaterialsDiffuseTransmission, KHRMaterialsIOR } from "@gltf-transform/extensions";
import { validateString } from "gltf-validator";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GltfInputBlock, GltfOutputBlock, NodeAsset, ValidateBlock } from "../../packages/core/src/index";
import { parseGlbAsync } from "../helpers/glb";
import { generateGltfJson, generateTexturedGltfJson } from "../helpers/gltf";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("document validation", () => {
    it("returns the same valid document with its content unchanged", async () => {
        const io = new NodeIO();
        const document = await io.readJSON({ json: JSON.parse(generateGltfJson()), resources: {} });
        const before = await io.writeJSON(document);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        const result = await new NodeAsset({ name: "valid-document", outputBlock: new ValidateBlock({ input: document }) }).executeAsync();

        expect(result).toBe(document);
        expect(await io.writeJSON(document)).toEqual(before);
        expect(log.mock.calls.flat()).toEqual(["\u2705 scene.glb is valid"]);
    });

    it("connects between document input and GLB output blocks", async () => {
        vi.spyOn(console, "log").mockImplementation(() => {});
        vi.stubGlobal(
            "fetch",
            vi.fn(() => Promise.resolve(new Response(generateGltfJson())))
        );
        const source = new GltfInputBlock({ input: "https://example.com/model.gltf" });
        const validate = new ValidateBlock();
        const destination = new GltfOutputBlock();
        source.output.connectTo(validate.input);
        validate.output.connectTo(destination.input);

        const parsed = await parseGlbAsync(await new NodeAsset({ name: "validated-pipeline", outputBlock: destination }).executeAsync());

        expect(parsed.json.meshes).toHaveLength(1);
    });

    it("fails on invalid binary accessor data, not just invalid JSON", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateGltfJson()), resources: {} });
        document
            .getRoot()
            .listAccessors()[2]!
            .setArray(new Uint16Array([0, 1, 99]));
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await expect(new NodeAsset({ name: "invalid-indices", outputBlock: new ValidateBlock({ input: document }) }).executeAsync()).rejects.toThrow();

        expect(log.mock.calls.flat().join("\n")).toContain("[Error]");
        expect(log.mock.calls.flat().join("\n")).not.toContain("is valid");
    });

    it("checks image bytes from serialized resources", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateTexturedGltfJson()), resources: {} });
        const texture = document.getRoot().listTextures()[0]!;
        texture.setImage(texture.getImage()!.slice(0, 16));
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await expect(new NodeAsset({ name: "invalid-image", outputBlock: new ValidateBlock({ input: document }) }).executeAsync()).rejects.toThrow();

        expect(log.mock.calls.flat().join("\n")).toContain("[Error]");
    });

    it("accepts multiple buffers and encoded resource URIs without fetching them", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateTexturedGltfJson()), resources: {} });
        document.getRoot().listBuffers()[0]!.setURI("mesh%20data.bin");
        const indices = document.createBuffer().setURI("indices.bin");
        document.getRoot().listAccessors()[3]!.setBuffer(indices);
        document.getRoot().listTextures()[0]!.setURI("texture%20(1).png");
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        expect(await new NodeAsset({ name: "resource-uris", outputBlock: new ValidateBlock({ input: document }) }).executeAsync()).toBe(document);
        expect(log.mock.calls.flat().join("\n")).not.toContain("[Error]");
    });

    it("ignores unsupported extensions without removing them from the document", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateGltfJson()), resources: {} });
        const extension = document.createExtension(KHRMaterialsDiffuseTransmission);
        const material = document.createMaterial().setExtension(extension.extensionName, extension.createDiffuseTransmission());
        document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setMaterial(material);
        const serialized = await new NodeIO().registerExtensions([KHRMaterialsDiffuseTransmission]).writeJSON(document);
        const baseline = await validateString(JSON.stringify(serialized.json));
        expect(baseline.issues.messages.some(({ code }) => code === "UNSUPPORTED_EXTENSION")).toBe(true);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        const result = await new NodeAsset({ name: "unsupported-extension", outputBlock: new ValidateBlock({ input: document }) }).executeAsync();

        expect(result).toBe(document);
        expect(result.hasExtension(extension.extensionName)).toBe(true);
        expect(log.mock.calls.flat()).toEqual(["\u2705 scene.glb is valid"]);
    });

    it("validates supported extensions on a directly supplied document", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateGltfJson()), resources: {} });
        const extension = document.createExtension(KHRMaterialsIOR);
        const material = document.createMaterial().setExtension(extension.extensionName, extension.createIOR().setIOR(0.5));
        document.getRoot().listMeshes()[0]!.listPrimitives()[0]!.setMaterial(material);
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await expect(new NodeAsset({ name: "invalid-extension", outputBlock: new ValidateBlock({ input: document }) }).executeAsync()).rejects.toThrow();

        expect(log.mock.calls.flat().join("\n")).toContain("[Error]");
    });

    it("does not let a large number of informational issues hide a later data error", async () => {
        const document = await new NodeIO().readJSON({ json: JSON.parse(generateGltfJson()), resources: {} });
        for (let i = 0; i < 10_001; i++) {
            document.createNode();
        }
        document
            .getRoot()
            .listAccessors()[2]!
            .setArray(new Uint16Array([0, 1, 99]));
        const log = vi.spyOn(console, "log").mockImplementation(() => {});

        await expect(new NodeAsset({ name: "many-issues", outputBlock: new ValidateBlock({ input: document }) }).executeAsync()).rejects.toThrow();

        const output = log.mock.calls.flat().join("\n");
        expect(output).toContain("[Error]");
        expect(output).toContain("at /nodes/10001");
        expect(output).not.toContain("is valid");
    });
});
