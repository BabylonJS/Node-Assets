import { randomUUID } from "node:crypto";
import { lstat, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { version } from "../package.json";
import { startBenchmark } from "./benchmark";
import { createByteFormatter } from "./format";
import { createPipelineAsync, getPipelineDefinitions } from "./pipeline";

export async function runCliAsync(args: string[]): Promise<void> {
    const { values, positionals } = parseArgs({
        args,
        allowPositionals: true,
        strict: true,
        options: {
            help: { type: "boolean", short: "h" },
            version: { type: "boolean", short: "v" },
            force: { type: "boolean", short: "f" },
            stats: { type: "boolean" },
            benchmark: { type: "boolean" },
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
    const inputFile = await stat(inputPath);
    if (!inputFile.isFile()) {
        throw new Error(`Input is not a regular file: ${inputPath}`);
    }
    const outputFile = await stat(outputPath).catch(ignoreMissing);
    if (outputFile?.dev === inputFile.dev && outputFile.ino === inputFile.ino) {
        throw new Error(`Output is the input file: ${outputPath}`);
    }
    const outputEntry = await lstat(outputPath).catch(ignoreMissing);
    if (outputEntry !== undefined && !values.force) {
        throw new Error(`Output already exists: ${outputPath}. Use --force to replace it.`);
    }
    if (outputEntry !== undefined && !outputEntry.isFile() && !outputEntry.isSymbolicLink()) {
        throw new Error(`Output is not a regular file: ${outputPath}`);
    }

    const finishBenchmark = values.benchmark ? startBenchmark() : undefined;
    const asset = await createPipelineAsync({ inputPath, outputPath, blockNames: remaining });
    let outputSize: number;
    try {
        const file = await asset.executeAsync();
        const bytes = new Uint8Array(await file.arrayBuffer());
        await (values.force ? replaceFileAsync(outputPath, bytes) : writeFile(outputPath, bytes, { flag: "wx" }));
        outputSize = file.size;
    } finally {
        asset.dispose();
    }
    const benchmarkReport = finishBenchmark?.();

    console.log(`Wrote ${outputPath}`);
    if (values.stats) {
        const formatSize = createByteFormatter(inputFile.size);
        console.log(`Stats:\n  Total size before: ${formatSize(inputFile.size)}\n  Total size after: ${formatSize(outputSize)}`);
    }
    if (benchmarkReport !== undefined) {
        console.log(benchmarkReport);
    }
}

function ignoreMissing(error: unknown): undefined {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
    }
    return undefined;
}

async function replaceFileAsync(path: string, bytes: Uint8Array): Promise<void> {
    // Renaming swaps the directory entry, so files linked to the old output are never written.
    const temporaryPath = join(dirname(path), `.${randomUUID()}.tmp`);
    try {
        await writeFile(temporaryPath, bytes, { flag: "wx" });
        await rename(temporaryPath, path);
    } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
}

function printHelp(): void {
    const { inputs, outputs, operations } = getPipelineDefinitions();
    const operationNameWidth = Math.max(...operations.map(({ name }) => name.length)) + 2;
    console.log(
        [
            "Usage: node-assets pipeline <input> [operations...] <output> [--force] [--stats] [--benchmark]",
            "",
            `Supported file types:`,
            `Input: ${inputs.flatMap(({ extensions }) => extensions).join(", ")}`,
            `Output: ${outputs.flatMap(({ extensions }) => extensions).join(", ")}`,
            "Paths are local and relative to the working directory.",
            "",
            "Operations:",
            ...operations.map(({ name, description }) => `  ${name.padEnd(operationNameWidth)}${description}`),
            "",
            "Options:",
            "  -h, --help     Show this help",
            "  -v, --version  Show the CLI version",
            "  -f, --force    Replace the output file if it already exists",
            "  --stats       Show named input/output file sizes in readable units",
            "  --benchmark   Show completion time, CPU time, RSS, and heap usage",
            "  --            End options before hyphen-prefixed paths",
            "",
            "Example: node-assets pipeline model.fbx cull-unused quantize meshopt output.glb",
        ].join("\n")
    );
}
