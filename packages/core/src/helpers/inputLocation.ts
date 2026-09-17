import type * as NodeUrl from "node:url";

import { isNodeRuntime } from "./isNodeRuntime";

export async function resolveInputLocationAsync(input: string): Promise<{ readonly uri: string; readonly path?: string }> {
    if (!isNodeRuntime() || !isFileLocation(input)) {
        return { uri: input };
    }
    const moduleName = "node:url";
    const { fileURLToPath, pathToFileURL } = (await import(/* @vite-ignore */ moduleName)) as typeof NodeUrl;
    const url = /^file:/i.test(input) ? new URL(input) : pathToFileURL(input);
    return { uri: url.href, path: fileURLToPath(url) };
}

export function isFileLocation(input: string): boolean {
    return /^file:/i.test(input) || /^[a-z]:[\\/]/i.test(input) || !/^[a-z][a-z\d+.-]*:/i.test(input);
}
