import type { Resource } from "./resource";

async function createMeshoptEncoderAsync() {
    const { MeshoptEncoder } = await import("meshoptimizer");
    await MeshoptEncoder.ready;
    return MeshoptEncoder;
}

export const MeshoptEncoderResource = {
    name: "Meshopt encoder",
    create: createMeshoptEncoderAsync,
    dispose: () => {},
} satisfies Resource<Awaited<ReturnType<typeof createMeshoptEncoderAsync>>>;
