import type * as FileSystemPromises from "node:fs/promises";
import type * as NodeModule from "node:module";

export async function loadNodePackageFileAsync(specifier: string): Promise<ArrayBuffer> {
    const moduleName = "node:module";
    const fileSystemModuleName = "node:fs/promises";
    const [{ createRequire }, { readFile }] = await Promise.all([
        import(/* @vite-ignore */ moduleName) as Promise<typeof NodeModule>,
        import(/* @vite-ignore */ fileSystemModuleName) as Promise<typeof FileSystemPromises>,
    ]);
    const path = createRequire(import.meta.url).resolve(specifier);
    return Uint8Array.from(await readFile(path)).buffer;
}
