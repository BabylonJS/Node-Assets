import { WebIO, type NodeIO as NodeIOInstance, type PlatformIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";

import { isNodeRuntime } from "../helpers/runtime";
import type { Resource } from "./resource";

export const PlatformIOResource = {
    name: "PlatformIO",
    create: createPlatformIOAsync,
    dispose: () => {},
} satisfies Resource<PlatformIO>;

async function createPlatformIOAsync(): Promise<PlatformIO> {
    const io = isNodeRuntime() ? await createNodeIOAsync() : new WebIO();
    return io.registerExtensions(ALL_EXTENSIONS);
}

async function createNodeIOAsync(): Promise<PlatformIO> {
    const moduleName = "@gltf-transform/core";
    const { NodeIO } = (await import(/* @vite-ignore */ moduleName)) as { readonly NodeIO: NodeIOConstructor };
    return new NodeIO(fetch).setAllowNetwork(true);
}

interface NodeIOConstructor {
    new (fetch?: unknown, fetchConfig?: RequestInit): NodeIOInstance;
}
