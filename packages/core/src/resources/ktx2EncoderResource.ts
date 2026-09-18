import type { KTX2Encoder } from "./ktx2Encoder";
import type { Resource } from "./resource";

export const KTX2EncoderResource = {
    name: "KTX2Encoder",
    create: async () => {
        const { KTX2Encoder } = await import("./ktx2Encoder");
        return new KTX2Encoder();
    },
    dispose: () => {},
} satisfies Resource<KTX2Encoder>;
