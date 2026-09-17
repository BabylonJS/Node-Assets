import { Document } from "@gltf-transform/core";
import { validateString, type ValidationIssue } from "gltf-validator";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NodeAsset, ValidateBlock } from "../../packages/core/src/index";

vi.mock("gltf-validator", () => ({ validateString: vi.fn() }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
});

describe("ValidateBlock diagnostics", () => {
    it("prints the success label and groups the example's informational issues and hints", async () => {
        const document = new Document();
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        const messages: ValidationIssue[] = [
            {
                code: "BUFFER_VIEW_TARGET_MISSING",
                message: "bufferView.target should be set for vertex or index data.",
                severity: 3,
                pointer: "/meshes/0/primitives/0/attributes/POSITION",
            },
            {
                code: "BUFFER_VIEW_TARGET_MISSING",
                message: "bufferView.target should be set for vertex or index data.",
                severity: 3,
                pointer: "/meshes/0/primitives/0/attributes/NORMAL",
            },
            {
                code: "BUFFER_VIEW_TARGET_MISSING",
                message: "bufferView.target should be set for vertex or index data.",
                severity: 3,
                pointer: "/meshes/0/primitives/0/indices",
            },
            { code: "NODE_EMPTY", message: "Empty node encountered.", severity: 2, pointer: "/nodes/1" },
            { code: "UNUSED_OBJECT", message: "This object may be unused.", severity: 2, pointer: "/bufferViews/2" },
        ];
        vi.mocked(validateString).mockResolvedValue({
            uri: "box%20(1).glb",
            issues: { numErrors: 0, numWarnings: 0, numInfos: 2, numHints: 3, messages, truncated: false },
        });
        const block = new ValidateBlock({ input: document, uri: "box%20(1).glb" });

        expect(await new NodeAsset({ name: "validation-report", outputBlock: block }).executeAsync()).toBe(document);
        expect(log.mock.calls.flat().join("\n")).toBe(
            [
                "\u2705 box%20(1).glb is valid",
                "[Warning] This object may be unused.\n  at /bufferViews/2",
                "[Warning] Empty node encountered.\n  at /nodes/1",
                "[Hint] bufferView.target should be set for vertex or index data.\n  at /meshes/0/primitives/0/indices\n  at /meshes/0/primitives/0/attributes/NORMAL\n  at /meshes/0/primitives/0/attributes/POSITION",
            ].join("\n\n")
        );
    });

    it("logs warnings, including diagnostics at the document root", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(validateString).mockResolvedValue({
            issues: {
                numErrors: 0,
                numWarnings: 1,
                numInfos: 0,
                numHints: 0,
                messages: [{ code: "TEST_WARNING", message: "Review this document.", severity: 1, pointer: "" }],
                truncated: false,
            },
        });

        await new NodeAsset({ name: "warning", outputBlock: new ValidateBlock({ input: new Document() }) }).executeAsync();

        expect(log.mock.calls.flat().join("\n")).toBe("\u2705 scene.glb is valid\n\n[Warning] Review this document.\n  at /");
    });

    it("logs every severity before rejecting a report containing errors", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(validateString).mockResolvedValue({
            issues: {
                numErrors: 1,
                numWarnings: 1,
                numInfos: 1,
                numHints: 1,
                messages: [
                    { code: "TEST_HINT", message: "A hint.", severity: 3, pointer: "/meshes/0" },
                    { code: "TEST_INFO", message: "Information.", severity: 2, pointer: "/nodes/0" },
                    { code: "TEST_WARNING", message: "A warning.", severity: 1, pointer: "/materials/0" },
                    { code: "TEST_ERROR", message: "An error.", severity: 0, pointer: "/accessors/0" },
                ],
                truncated: false,
            },
        });

        await expect(new NodeAsset({ name: "invalid", outputBlock: new ValidateBlock({ input: new Document() }) }).executeAsync()).rejects.toThrow();

        expect(log.mock.calls.flat().join("\n")).toBe(
            ["[Error] An error.\n  at /accessors/0", "[Warning] A warning.\n  at /materials/0", "[Warning] Information.\n  at /nodes/0", "[Hint] A hint.\n  at /meshes/0"].join(
                "\n\n"
            )
        );
    });

    it("propagates validator failures without claiming success", async () => {
        const log = vi.spyOn(console, "log").mockImplementation(() => {});
        vi.mocked(validateString).mockRejectedValue(new Error("Validator failed"));

        await expect(new NodeAsset({ name: "validator-failure", outputBlock: new ValidateBlock({ input: new Document() }) }).executeAsync()).rejects.toThrow();

        expect(log.mock.calls).toEqual([]);
    });
});
