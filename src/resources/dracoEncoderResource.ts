import encoderWasmUrl from "draco3dgltf/draco_encoder.wasm?url&no-inline";

import { loadNodePackageFileAsync } from "../helpers/loadNodePackageFile";
import { isNodeRuntime } from "../helpers/runtime";
import type { Resource } from "./resource";

async function createDracoEncoderAsync() {
    const { createEncoderModule } = await import("draco3dgltf");
    return createEncoderModule(
        isNodeRuntime()
            ? { wasmBinary: await loadNodePackageFileAsync("draco3dgltf/draco_encoder.wasm") }
            : { locateFile: (path: string) => (path.endsWith(".wasm") ? encoderWasmUrl : path) }
    );
}

export const DracoEncoderResource = {
    name: "Draco encoder",
    create: createDracoEncoderAsync,
    dispose: () => {},
} satisfies Resource<Awaited<ReturnType<typeof createDracoEncoderAsync>>>;
