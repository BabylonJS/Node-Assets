import type { NullEngine as BabylonNullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { isNodeRuntime } from "../helpers/isNodeRuntime";
import type { Resource } from "./resource";

export const NullEngineResource = {
    name: "NullEngine",
    create: async () => {
        if (isNodeRuntime()) {
            const { initializeNodeXmlHttpRequestAsync } = await import("../helpers/nodeXmlHttpRequest");
            await initializeNodeXmlHttpRequestAsync();
        }
        const { NullEngine } = await import("@babylonjs/core/Engines/nullEngine.js");
        return new NullEngine();
    },
    dispose: (engine) => engine.dispose(),
} satisfies Resource<BabylonNullEngine>;
