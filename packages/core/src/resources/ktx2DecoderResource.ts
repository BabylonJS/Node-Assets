import type { KTX2Decoder } from "./ktx2Decoder";
import type { Resource } from "./resource";

export const KTX2DecoderResource = {
    name: "KTX2Decoder",
    create: async () => {
        const { KTX2Decoder } = await import("./ktx2Decoder");
        return new KTX2Decoder();
    },
    dispose: () => {},
} satisfies Resource<KTX2Decoder>;
