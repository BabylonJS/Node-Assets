import type { IDracoCodecConfiguration } from "@babylonjs/core/Meshes/Compression/dracoCodec.js";
import { initializeWebWorker } from "@babylonjs/core/Meshes/Compression/dracoCompressionWorker.js";

import { AutoReleaseNodeWorkerPool, createNodeWorkerAdapter, getDefaultNodeWorkerCount } from "./autoReleaseNodeWorkerPool";

export async function createNodeDracoEncoderConfigurationAsync(): Promise<IDracoCodecConfiguration> {
    const [{ createRequire }, { readFile }, { dirname }, { availableParallelism }, { pathToFileURL }, { Worker: NodeWorkerConstructor }] = await Promise.all([
        import("node:module"),
        import("node:fs/promises"),
        import("node:path"),
        import("node:os"),
        import("node:url"),
        import("node:worker_threads"),
    ]);
    const resolve = createRequire(import.meta.url).resolve;
    const wrapperPath = resolve("@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js");
    const wasmBinaryPath = resolve("@babylonjs/core/assets/Draco/draco_encoder.wasm");
    const workerModulePath = resolve("@babylonjs/core/Meshes/Compression/dracoCompressionWorker.js");
    const wrapperUrl = pathToFileURL(wrapperPath).href;
    const wasmBinaryUrl = pathToFileURL(wasmBinaryPath).href;
    const workerModuleUrl = pathToFileURL(workerModulePath).href;
    let wasmBinaryPromise: Promise<ArrayBuffer> | undefined;

    const loadWasmBinaryAsync = async (): Promise<ArrayBuffer> => {
        const loadPromise = (wasmBinaryPromise ??= readFile(wasmBinaryPath).then((file) => Uint8Array.from(file).buffer));
        try {
            return await loadPromise;
        } catch (error) {
            if (wasmBinaryPromise === loadPromise) {
                wasmBinaryPromise = undefined;
            }
            throw error;
        }
    };

    const workerPool = new AutoReleaseNodeWorkerPool(getDefaultNodeWorkerCount(availableParallelism()), (onFatalError) => {
        const nodeWorker = new NodeWorkerConstructor(new URL(`data:text/javascript,${encodeURIComponent(NodeDracoWorkerBootstrap)}`), {
            workerData: {
                wrapperDirectory: dirname(wrapperPath),
                wrapperUrl,
                workerModuleUrl,
            },
        });
        const worker = createNodeWorkerAdapter(nodeWorker, onFatalError);
        const ready = loadWasmBinaryAsync()
            .then(async (wasmBinary) => {
                await initializeWebWorker(worker, wasmBinary);
            })
            .catch((error: unknown) => {
                worker.terminate();
                throw error;
            });
        return { ready, worker };
    });

    return {
        wasmBinaryUrl,
        wasmUrl: wrapperUrl,
        workerPool,
    };
}

const NodeDracoWorkerBootstrap = String.raw`
import { parentPort, workerData } from "node:worker_threads";

if (parentPort === null) {
    throw new Error("The Draco encoder worker requires a parent port.");
}

globalThis.self = globalThis;
globalThis.onmessage = undefined;
globalThis.postMessage = (value, transferList) => parentPort.postMessage(value, transferList);
Object.defineProperty(globalThis, "__dirname", {
    configurable: true,
    value: workerData.wrapperDirectory,
});

const pendingMessages = [];
parentPort.on("message", (data) => {
    if (typeof globalThis.onmessage === "function") {
        globalThis.onmessage({ data });
    } else {
        pendingMessages.push(data);
    }
});

void (async () => {
    const wrapperModule = await import(workerData.wrapperUrl);
    globalThis.DracoEncoderModule =
        wrapperModule.default ?? wrapperModule.DracoEncoderModule ?? globalThis.DracoEncoderModule;
    if (typeof globalThis.DracoEncoderModule !== "function") {
        throw new Error("The Babylon.js Draco encoder module did not load.");
    }
    const { EncoderWorkerFunction } = await import(workerData.workerModuleUrl);
    EncoderWorkerFunction();
    for (const data of pendingMessages.splice(0)) {
        globalThis.onmessage({ data });
    }
})().catch((error) => {
    queueMicrotask(() => {
        throw error;
    });
});
`;
