import type { Resource } from "./resource";
import { isNodeRuntime } from "../helpers/runtime";
import encoderWasmUrl from "draco3dgltf/draco_encoder.wasm?url&no-inline";

async function createDracoEncoderAsync() {
    const { createEncoderModule } = await import("draco3dgltf");
    return createEncoderModule(isNodeRuntime() ? undefined : { locateFile: (path: string) => (path.endsWith(".wasm") ? encoderWasmUrl : path) });
}

export const DracoEncoderResource = {
    name: "Draco encoder",
    create: createDracoEncoderAsync,
    dispose: () => {},
} satisfies Resource<Awaited<ReturnType<typeof createDracoEncoderAsync>>>;
