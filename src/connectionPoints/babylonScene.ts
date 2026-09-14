import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";

import { defineConnectionPointType } from "./connectionPoint";

export const BabylonSceneType = /* @__PURE__ */ defineConnectionPointType<BabylonScene>(
    "babylon-scene",
    (value): value is BabylonScene =>
        typeof value === "object" && value !== null && "getEngine" in value && typeof value.getEngine === "function" && "dispose" in value && typeof value.dispose === "function",
    true
);
