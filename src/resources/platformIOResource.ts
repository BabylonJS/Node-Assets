import type { PlatformIO } from "@gltf-transform/core";

import { isNodeRuntime } from "../helpers/runtime";
import type { Resource } from "./resource";

export const PlatformIOResource = {
    name: "PlatformIO",
    create: createPlatformIOAsync,
    dispose: () => {},
} satisfies Resource<PlatformIO>;

async function createPlatformIOAsync(): Promise<PlatformIO> {
    const [{ NodeIO, WebIO }, { ALL_EXTENSIONS }] = await Promise.all([import("@gltf-transform/core"), import("@gltf-transform/extensions")]);
    const io = isNodeRuntime() ? new NodeIO(fetch).setAllowNetwork(true) : new WebIO();
    return io.registerExtensions(ALL_EXTENSIONS);
}
