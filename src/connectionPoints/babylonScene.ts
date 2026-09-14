import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";

import { defineConnectionPointType } from "./connectionPoint";

export const BabylonSceneType = /* @__PURE__ */ defineConnectionPointType<BabylonScene>(
    "babylon-scene",
    (value): value is BabylonScene =>
        typeof value === "object" &&
        value !== null &&
        "getEngine" in value &&
        typeof value.getEngine === "function" &&
        "dispose" in value &&
        typeof value.dispose === "function" &&
        "isDisposed" in value &&
        typeof value.isDisposed === "boolean" &&
        "onDisposeObservable" in value &&
        typeof value.onDisposeObservable === "object" &&
        value.onDisposeObservable !== null &&
        "addOnce" in value.onDisposeObservable &&
        typeof value.onDisposeObservable.addOnce === "function" &&
        "makeObserverTopPriority" in value.onDisposeObservable &&
        typeof value.onDisposeObservable.makeObserverTopPriority === "function"
);
