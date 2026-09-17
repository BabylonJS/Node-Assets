import { stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { version } from "../package.json";
import { createPipelineAsync, getPipelineDefinitions } from "./pipeline";

export async function runCliAsync(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        options: {
            help: { type: "boolean", short: "h" },
            version: { type: "boolean", short: "v" },
        },
    });

    if (values.help || args.length === 0) {
        printHelp();
        return;
    }
    if (values.version) {
        console.log(version);
        return;
    }

    const [command, input, ...remaining] = positionals;
    if (command !== "pipeline") {
        throw new Error(`Unknown command "${command ?? ""}". Run node-assets --help for usage.`);
    }
    const output = remaining.pop();
    if (input === undefined || output === undefined) {
        throw new Error("A pipeline requires an input file and an output file.");
    }

    const inputPath = resolve(input);
    const outputPath = resolve(output);
    if (!(await stat(inputPath)).isFile()) {
        throw new Error(`Input is not a regular file: ${inputPath}`);
    }

    const asset = await createPipelineAsync({ inputPath, outputPath, blockNames: remaining });
    try {
        const file = await asset.executeAsync();
        await writeFile(outputPath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
        console.log(`Wrote ${outputPath}`);
    } finally {
        asset.dispose();
    }
}

function printHelp(): void {
    const { inputs, outputs, operations } = getPipelineDefinitions();
    console.log(
        [
            "Usage: node-assets pipeline <input> [operations...] <output>",
            "",
            `Supported file types:`,
            `Input: ${inputs.flatMap(({ extensions }) => extensions).join(", ")}`,
            `Output: ${outputs.flatMap(({ extensions }) => extensions).join(", ")}`,
            "Paths are local and relative to the working directory.",
            "",
            "Operations:",
            ...operations.map(({ name, description }) => `  ${name.padEnd(9)}${description}`),
            "",
            "Options:",
            "  -h, --help     Show this help",
            "  -v, --version  Show the CLI version",
            "  --            End options before hyphen-prefixed paths",
            "",
            "Example: node-assets pipeline input.gltf ktx2 draco output.glb",
        ].join("\n")
    );
}
