import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import cliPackage from "../../packages/cli/package.json";
import { EncodeDracoBlock, EncodeKTX2Block, EncodeMeshoptBlock, GltfInputBlock, GltfOutputBlock, NodeAsset } from "../../packages/core/src/index";
import { buildCliFixtureAsync, runNodeAsync } from "../helpers/cli";
import { expectKtx2Image, parseGlbAsync } from "../helpers/glb";
import { generateGlbDataUri, generateGltfJson, generateTexturedGltfJson } from "../helpers/gltf";

describe("Node Assets CLI", () => {
    let directory: string;
    let launcher: string;
    let input: string;
    let texturedInput: string;

    beforeAll(async () => {
        directory = await mkdtemp(fileURLToPath(new URL("../../packages/core/node_modules/.node-assets-cli-", import.meta.url)));
        launcher = await buildCliFixtureAsync(directory);
        input = join(directory, "input.gltf");
        texturedInput = join(directory, "textured.gltf");
        await writeFile(input, generateGltfJson());
        await writeFile(texturedInput, generateTexturedGltfJson());
        const glbDataUri = generateGlbDataUri();
        await writeFile(join(directory, "input.glb"), Buffer.from(glbDataUri.slice(glbDataUri.indexOf(",") + 1), "base64"));
    }, 120_000);

    afterAll(async () => {
        if (directory !== undefined) {
            await rm(directory, { recursive: true, force: true });
        }
    });

    it.each([[], ["--help"], ["-h"], ["pipeline", "--help"]].map((args) => ({ args })))("shows help for $args", async ({ args }) => {
        const result = await runNodeAsync([launcher, ...args], directory);
        expect(result.code).toBe(0);
        expect(result.stderr).toBe("");
        for (const term of ["pipeline", ".gltf", ".glb", "draco", "meshopt", "ktx2", "--stats", "--benchmark"]) {
            expect(result.stdout).toContain(term);
        }
    });

    it.each(["--version", "-v"])("reports the package version with %s", async (flag) => {
        const result = await runNodeAsync([launcher, flag], directory);
        expect(result.code).toBe(0);
        expect(result.stdout.trim()).toBe(cliPackage.version);
        expect(result.stderr).toBe("");
    });

    it.each(
        [
            ["unknown"],
            ["pipeline"],
            ["pipeline", "input.gltf"],
            ["pipeline", "input.gltf", "unknown", "output.glb"],
            ["pipeline", "input.gltf", "DRACO", "output.glb"],
            ["pipeline", "--unknown", "input.gltf", "output.glb"],
            ["pipeline", "input.gltf", "--force", "output.glb"],
            ["pipeline", "input.obj", "output.glb"],
            ["pipeline", "input", "output.glb"],
            ["pipeline", "input.gltf", "output.gltf"],
            ["pipeline", "input.gltf", "output"],
        ].map((args) => ({ args }))
    )("rejects invalid arguments $args", async ({ args }) => {
        const cwd = await mkdtemp(join(directory, "invalid-"));
        await cp(input, join(cwd, "input.gltf"));
        await cp(input, join(cwd, "input.obj"));
        await cp(input, join(cwd, "input"));
        const before = await readdir(cwd);
        const result = await runNodeAsync([launcher, ...args], cwd);
        expect(result.code).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        expect(await readdir(cwd)).toEqual(before);
    });

    it.each(["gltf", "glb"])("round trips a local %s without transforms", async (extension) => {
        const output = join(directory, `roundtrip-${extension}.glb`);
        const result = await runNodeAsync([launcher, "pipeline", `input.${extension}`, output], directory);
        expect(result.code).toBe(0);
        expect(result.stdout).not.toContain("Stats:");
        expect(result.stdout).not.toContain("Benchmark:");
        const document = await new NodeIO().read(output);
        expect(document.getRoot().listMeshes()[0]?.listPrimitives()[0]?.getAttribute("POSITION")?.getArray()).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
        const parsed = await readGlbAsync(output);
        expect(parsed.json.extensionsUsed ?? []).not.toContain("KHR_draco_mesh_compression");
        expect(parsed.json.extensionsUsed ?? []).not.toContain("EXT_meshopt_compression");
    });

    it.each([
        { extension: "gltf", flags: ["--stats"] },
        { extension: "glb", flags: ["--stats"] },
        { extension: "glb", flags: ["--benchmark"] },
        { extension: "glb", flags: ["--stats", "--benchmark"] },
    ])("reports requested metrics for $extension with $flags", async ({ extension, flags }) => {
        const source = join(directory, `input.${extension}`);
        const output = join(directory, `report-${extension}-${flags.join("-")}.glb`);
        const result = await runNodeAsync([launcher, "pipeline", source, "draco", output, ...flags], directory);
        expect(result.code).toBe(0);
        expect(result.stderr).toBe("");
        expect((await readGlbAsync(output)).json.extensionsUsed).toContain("KHR_draco_mesh_compression");
        expect(result.stdout).toContain(`Wrote ${output}`);

        if (flags.includes("--stats")) {
            expect(result.stdout).toContain(`Stats:\n  Total size before: ${(await stat(source)).size} bytes\n  Total size after: ${(await stat(output)).size} bytes`);
        } else {
            expect(result.stdout).not.toContain("Stats:");
        }

        if (flags.includes("--benchmark")) {
            expect(result.stdout).toContain("Benchmark:");
            for (const label of ["Completion time", "CPU time (user)", "CPU time (system)"]) {
                const line = result.stdout.split("\n").find((line) => line.startsWith(`  ${label}: `));
                expect(line).toMatch(/: \d+\.\d{2} ms$/u);
                const value = Number(line?.split(": ")[1]?.split(" ")[0]);
                expect(value).toBeGreaterThanOrEqual(0);
                if (label === "Completion time") {
                    expect(value).toBeGreaterThan(0);
                }
            }
            for (const label of ["RSS", "Peak RSS (process lifetime)", "Heap used"]) {
                const line = result.stdout.split("\n").find((line) => line.startsWith(`  ${label}: `));
                expect(line).toMatch(/: \d+ bytes$/u);
                expect(Number(line?.split(": ")[1]?.split(" ")[0])).toBeGreaterThan(0);
            }
        } else {
            expect(result.stdout).not.toContain("Benchmark:");
        }
    });

    it("resolves sibling glTF resources from the input path", async () => {
        const sourceDirectory = join(directory, "external");
        await mkdir(sourceDirectory);
        const io = new NodeIO();
        await io.write(join(sourceDirectory, "model.gltf"), await io.read(input));
        expect(await readdir(sourceDirectory)).toContain("model.bin");

        const output = join(directory, "external.glb");
        const result = await runNodeAsync([launcher, "pipeline", "external/model.gltf", output], directory);
        expect(result.code).toBe(0);
        expect((await io.read(output)).getRoot().listMeshes()).toHaveLength(1);
    });

    it("accepts uppercase extensions and relative paths with spaces from another directory", async () => {
        const cwd = join(directory, "working directory");
        await mkdir(cwd);
        await cp(input, join(cwd, "source file.GLTF"));
        const result = await runNodeAsync([launcher, "pipeline", "source file.GLTF", "output file.GLB"], cwd);
        expect(result.code).toBe(0);
        expect((await new NodeIO().read(join(cwd, "output file.GLB"))).getRoot().listMeshes()).toHaveLength(1);
    });

    it("accepts hyphen-prefixed paths after the option terminator", async () => {
        const cwd = await mkdtemp(join(directory, "hyphens-"));
        await cp(input, join(cwd, "-input.gltf"));
        const result = await runNodeAsync([launcher, "--", "pipeline", "-input.gltf", "-output.glb"], cwd);
        expect(result.code).toBe(0);
        expect((await new NodeIO().read(join(cwd, "-output.glb"))).getRoot().listMeshes()).toHaveLength(1);
    });

    it.each([
        { blocks: ["draco"], geometry: "KHR_draco_mesh_compression", ktx2: false },
        { blocks: ["meshopt"], geometry: "EXT_meshopt_compression", ktx2: false },
        { blocks: ["ktx2"], geometry: undefined, ktx2: true },
        { blocks: ["ktx2", "draco"], geometry: "KHR_draco_mesh_compression", ktx2: true },
        { blocks: ["ktx2", "meshopt"], geometry: "EXT_meshopt_compression", ktx2: true },
    ])(
        "encodes $blocks through the built package",
        async ({ blocks, geometry, ktx2 }) => {
            const output = join(directory, `${blocks.join("-")}.glb`);
            const result = await runNodeAsync([launcher, "pipeline", texturedInput, ...blocks, output], directory);
            expect(result.code).toBe(0);
            const parsed = await readGlbAsync(output);
            if (geometry !== undefined) {
                expect(parsed.json.extensionsUsed).toContain(geometry);
                if (geometry === "KHR_draco_mesh_compression") {
                    expect(parsed.json.meshes?.[0]?.primitives[0]?.extensions?.KHR_draco_mesh_compression).toBeDefined();
                } else {
                    expect(parsed.json.bufferViews?.some(({ extensions }) => extensions?.EXT_meshopt_compression !== undefined)).toBe(true);
                }
            }
            if (ktx2) {
                expect(parsed.json.extensionsUsed).toContain("KHR_texture_basisu");
                expectKtx2Image(parsed);
            }
        },
        60_000
    );

    it.each([
        { blocks: ["draco", "draco"], first: EncodeDracoBlock, second: EncodeDracoBlock },
        { blocks: ["ktx2", "ktx2"], first: EncodeKTX2Block, second: EncodeKTX2Block },
        { blocks: ["draco", "meshopt"], first: EncodeDracoBlock, second: EncodeMeshoptBlock },
        { blocks: ["meshopt", "draco"], first: EncodeMeshoptBlock, second: EncodeDracoBlock },
    ])(
        "matches library behavior for $blocks without imposing restrictions",
        async ({ blocks, first: FirstBlock, second: SecondBlock }) => {
            const source = new GltfInputBlock({ input: texturedInput });
            const first = new FirstBlock();
            const second = new SecondBlock();
            const destination = new GltfOutputBlock();
            source.output.connectTo(first.input);
            first.output.connectTo(second.input);
            second.output.connectTo(destination.input);
            const asset = new NodeAsset({ name: "reference", outputBlock: destination });
            const output = join(directory, `sequence-${blocks.join("-")}.glb`);

            try {
                const [reference] = await Promise.allSettled([asset.executeAsync()]);
                const result = await runNodeAsync([launcher, "pipeline", texturedInput, ...blocks, output], directory);
                if (reference?.status === "fulfilled") {
                    expect(result.code).toBe(0);
                    expect((await readGlbAsync(output)).json).toEqual((await parseGlbAsync(reference.value)).json);
                } else {
                    expect(result.code).toBe(1);
                    expect(result.stderr.trim()).not.toBe("");
                    await expect(readFile(output)).rejects.toThrow();
                }
            } finally {
                asset.dispose();
            }
        },
        60_000
    );

    it.each([[], ["--stats", "--benchmark"]].map((flags) => ({ flags })))("does not overwrite an existing destination with $flags", async ({ flags }) => {
        const output = join(directory, `existing-${flags.join("-")}.glb`);
        const original = Buffer.from("keep this file");
        await writeFile(output, original);
        const result = await runNodeAsync([launcher, ...flags, "pipeline", input, output], directory);
        expect(result.code).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        expect(result.stdout).not.toContain("Wrote ");
        expect(result.stdout).not.toContain("Stats:");
        expect(result.stdout).not.toContain("Benchmark:");
        expect(await readFile(output)).toEqual(original);
    });

    it("does not overwrite the input through an equivalent relative output path", async () => {
        const source = join(directory, "input.glb");
        const original = await readFile(source);
        const result = await runNodeAsync([launcher, "pipeline", source, relative(directory, source)], directory);
        expect(result.code).toBe(1);
        expect(await readFile(source)).toEqual(original);
    });

    it.each(["missing", "malformed", "directory"])("surfaces a %s input without creating output", async (kind) => {
        const source = join(directory, `${kind}.gltf`);
        const output = join(directory, `${kind}.glb`);
        if (kind === "malformed") {
            await writeFile(source, "not glTF");
        } else if (kind === "directory") {
            await mkdir(source);
        }
        const result = await runNodeAsync([launcher, "pipeline", source, output], directory);
        expect(result.code).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        await expect(readFile(output)).rejects.toThrow();
    });

    it("surfaces a missing output parent without creating directories", async () => {
        const parent = join(directory, "missing-parent");
        const result = await runNodeAsync([launcher, "pipeline", input, join(parent, "output.glb")], directory);
        expect(result.code).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        await expect(readdir(parent)).rejects.toThrow();
    });

    it("refuses a directory destination", async () => {
        const output = join(directory, "destination.glb");
        await mkdir(output);
        const result = await runNodeAsync([launcher, "pipeline", input, output], directory);
        expect(result.code).toBe(1);
        expect(result.stderr.trim()).not.toBe("");
        expect(await readdir(output)).toEqual([]);
    });
});

async function readGlbAsync(path: string) {
    const bytes = await readFile(path);
    return parseGlbAsync(new File([bytes], "scene.glb", { type: "model/gltf-binary" }));
}
