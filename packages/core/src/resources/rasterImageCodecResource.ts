import { isNodeRuntime } from "../helpers/isNodeRuntime";
import type { Resource } from "./resource";
import type { RasterImageCodec } from "./rasterImageCodec";

export const RasterImageCodecResource = {
    name: "RasterImageCodec",
    create: createRasterImageCodecAsync,
    dispose: (codec) => codec.disposeAsync(),
} satisfies Resource<RasterImageCodec>;

async function createRasterImageCodecAsync(): Promise<RasterImageCodec> {
    if (isNodeRuntime()) {
        const { NodeRasterImageCodec } = await import("./nodeRasterImageCodec");
        return new NodeRasterImageCodec();
    }
    const { WebRasterImageCodec } = await import("./webRasterImageCodec");
    return new WebRasterImageCodec();
}
