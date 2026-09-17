import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { ValidationIssue } from "gltf-validator";

import { GltfDocumentType } from "../connectionPoints/gltfDocument";
import { UrlType } from "../connectionPoints/url";
import { PlatformIOResource } from "../resources/platformIOResource";
import { Block, type BlockOptions } from "./block";
import { defineBlock, value } from "./blockDefinition";

const ValidateBlockDefinition = /* @__PURE__ */ defineBlock({
    type: "transform.validate",
    input: GltfDocumentType,
    output: GltfDocumentType,
    config: {
        uri: /* @__PURE__ */ value(UrlType, "scene.glb"),
    },
    resources: {
        io: PlatformIOResource,
    },
    runAsync: async (document, { uri }, { io }) => {
        const { validateString } = await import("gltf-validator");
        const { json, resources } = await io.registerExtensions(ALL_EXTENSIONS).writeJSON(document);
        const report = await validateString(JSON.stringify(json), {
            uri,
            ignoredIssues: ["UNSUPPORTED_EXTENSION"],
            maxIssues: 0,
            externalResourceFunction: async (resourceUri) => {
                const data = resources[resourceUri] ?? resources[decodeURIComponent(resourceUri)];
                if (data === undefined) {
                    throw new Error(`Missing serialized resource "${resourceUri}".`);
                }
                return data;
            },
        });

        const diagnostics = formatIssues(report.issues.messages);
        if (report.issues.numErrors === 0) {
            diagnostics.unshift(`\u2705 ${uri} is valid`);
        }
        console.log(diagnostics.join("\n\n"));

        if (report.issues.numErrors > 0) {
            throw new Error(`glTF validation failed for "${uri}" with ${report.issues.numErrors} error(s).`);
        }
        return document;
    },
});

/** Options for the block, its input document, and a diagnostic URI label (default: scene.glb). */
export type ValidateBlockOptions = BlockOptions<typeof ValidateBlockDefinition>;

/** Validates a document, logs grouped diagnostics, and rejects execution on validation errors. */
export class ValidateBlock extends Block<typeof ValidateBlockDefinition> {
    public constructor(options?: ValidateBlockOptions) {
        super(ValidateBlockDefinition, options);
    }
}

function formatIssues(issues: readonly ValidationIssue[]): string[] {
    const groups = new Map<string, { issue: ValidationIssue; locations: string[] }>();
    for (const issue of [...issues].reverse()) {
        const key = JSON.stringify([issue.severity, issue.code, issue.message]);
        let group = groups.get(key);
        if (group === undefined) {
            group = { issue, locations: [] };
            groups.set(key, group);
        }
        if (issue.pointer !== undefined) {
            group.locations.push(`  at ${issue.pointer || "/"}`);
        } else if (issue.offset !== undefined) {
            group.locations.push(`  at byte ${issue.offset}`);
        }
    }
    return [...groups.values()]
        .sort((a, b) => a.issue.severity - b.issue.severity)
        .map(({ issue, locations }) => {
            const label = issue.severity === 0 ? "Error" : issue.severity === 3 ? "Hint" : "Warning";
            return [`[${label}] ${issue.message}`, ...locations].join("\n");
        });
}
