import decoderWasmUrl from "draco3dgltf/draco_decoder_gltf.wasm?url&no-inline";

import { loadNodePackageFileAsync } from "../helpers/loadNodePackageFile";
import { isNodeRuntime } from "../helpers/isNodeRuntime";
import type { Resource } from "./resource";

async function createGltfDecodersAsync() {
    const [{ createDecoderModule }, { MeshoptDecoder }] = await Promise.all([import("draco3dgltf"), import("meshoptimizer")]);
    const [dracoDecoder] = await Promise.all([
        createDecoderModule(
            isNodeRuntime()
                ? { wasmBinary: await loadNodePackageFileAsync("draco3dgltf/draco_decoder_gltf.wasm") }
                : { locateFile: (path: string) => (path.endsWith(".wasm") ? decoderWasmUrl : path) }
        ),
        MeshoptDecoder.ready,
    ]);
    return Object.freeze({
        "draco3d.decoder": dracoDecoder,
        "meshopt.decoder": MeshoptDecoder,
    });
}

export const GltfDecoderResource = {
    name: "glTF decoders",
    create: createGltfDecodersAsync,
    dispose: () => {},
} satisfies Resource<Awaited<ReturnType<typeof createGltfDecodersAsync>>>;
