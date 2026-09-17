import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { ISceneLoaderPluginFactory, LoadOptions } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";

import { resolveInputLocationAsync } from "./inputLocation";

export async function loadSceneWithPluginAsync(source: string, engine: AbstractEngine, factory: ISceneLoaderPluginFactory, options: LoadOptions): Promise<Scene> {
    const { uri } = await resolveInputLocationAsync(source);
    const { LoadSceneAsync, RegisterSceneLoaderPlugin } = await import("@babylonjs/core/Loading/sceneLoader.js");
    RegisterSceneLoaderPlugin(factory);
    return LoadSceneAsync(uri, engine, options);
}
