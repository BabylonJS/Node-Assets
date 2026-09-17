import { execFile } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";

import cliPackage from "../../packages/cli/package.json";
import libraryConfig from "../../packages/core/vite.config";

export async function buildCliFixtureAsync(directory: string): Promise<string> {
    const libraryDirectory = join(directory, "node_modules", "@babylonjs", "node-assets");
    const cliDirectory = join(directory, "node_modules", "@babylonjs", "node-assets-cli");
    await mkdir(libraryDirectory, { recursive: true });
    await mkdir(cliDirectory, { recursive: true });
    await cp(new URL("../../packages/core/package.json", import.meta.url), join(libraryDirectory, "package.json"));
    await cp(new URL("../../packages/cli/package.json", import.meta.url), join(cliDirectory, "package.json"));
    await cp(new URL("../../packages/cli/bin", import.meta.url), join(cliDirectory, "bin"), { recursive: true });

    await build({
        ...libraryConfig,
        configFile: false,
        logLevel: "silent",
        // Declaration bundling targets the real package's dist; this isolated fixture only executes JavaScript.
        plugins: (libraryConfig.plugins ?? []).filter((plugin) => !plugin || !("name" in plugin) || plugin.name !== "vite:dts"),
        build: { ...libraryConfig.build, outDir: join(libraryDirectory, "dist") },
    });
    await build({
        configFile: fileURLToPath(new URL("../../packages/cli/vite.config.ts", import.meta.url)),
        logLevel: "silent",
        build: { outDir: join(cliDirectory, "dist") },
    });

    return join(cliDirectory, cliPackage.bin["node-assets"]);
}

interface CommandResult {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
}

export function runNodeAsync(args: readonly string[], cwd: string): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
        execFile(process.execPath, args, { cwd, timeout: 30_000 }, (error, stdout, stderr) => {
            const code = error?.code ?? 0;
            if (typeof code !== "number" || error?.killed) {
                reject(error);
                return;
            }
            resolve({ code, stdout, stderr });
        });
    });
}
