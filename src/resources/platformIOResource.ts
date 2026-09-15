import { WebIO, type NodeIO as NodeIOInstance, type PlatformIO } from "@gltf-transform/core";

import { isNodeRuntime } from "../helpers/isNodeRuntime";
import type { Resource } from "./resource";

export const PlatformIOResource = {
    name: "PlatformIO",
    create: createPlatformIOAsync,
    dispose: () => {},
} satisfies Resource<PlatformIO>;

async function createPlatformIOAsync(): Promise<PlatformIO> {
    return isNodeRuntime() ? createNodeIOAsync() : new WebIO();
}

async function createNodeIOAsync(): Promise<PlatformIO> {
    const moduleName = "@gltf-transform/core";
    const { NodeIO } = (await import(/* @vite-ignore */ moduleName)) as { readonly NodeIO: NodeIOConstructor };
    return new NodeIO(fetch).setAllowNetwork(true);
}

interface NodeIOConstructor {
    new (fetch?: unknown, fetchConfig?: RequestInit): NodeIOInstance;
}
