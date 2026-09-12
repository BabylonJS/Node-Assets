import type { IDracoCodecConfiguration } from "@babylonjs/core/Meshes/Compression/dracoCodec.js";
import { initializeWebWorker } from "@babylonjs/core/Meshes/Compression/dracoCompressionWorker.js";
import { WorkerPool } from "@babylonjs/core/Misc/workerPool.js";
import type { Worker as NodeWorker } from "node:worker_threads";

type WorkerAction = (worker: Worker, onComplete: () => void) => void;

/** @internal */
export interface _ManagedNodeWorker extends Worker {
    readonly dead: boolean;
    dispatchFailure(error: unknown): void;
    ref(): void;
    unref(): void;
}

interface WorkerSlot {
    action?: WorkerAction;
    actionStarted: boolean;
    busy: boolean;
    idleTimer?: ReturnType<typeof setTimeout>;
    initialization?: Promise<_ManagedNodeWorker>;
    removed: boolean;
    worker?: _ManagedNodeWorker;
}

const IdleWorkerLifetimeMilliseconds = 1000;

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

    const workerPool = new _NodeDracoWorkerPool(_getNodeWorkerCount(availableParallelism()), async (onFatalError) => {
        const nodeWorker = new NodeWorkerConstructor(new URL(`data:text/javascript,${encodeURIComponent(NodeDracoWorkerBootstrap)}`), {
            workerData: {
                wrapperDirectory: dirname(wrapperPath),
                wrapperUrl,
                workerModuleUrl,
            },
        });
        const worker = new NodeWorkerAdapter(nodeWorker, onFatalError);
        try {
            await initializeWebWorker(worker, await loadWasmBinaryAsync());
            return worker;
        } catch (error) {
            worker.terminate();
            throw error;
        }
    });

    return {
        wasmBinaryUrl,
        wasmUrl: wrapperUrl,
        workerPool,
    };
}

/** @internal */
export function _getNodeWorkerCount(availableParallelism: number): number {
    return Math.min(Math.max(Math.floor(availableParallelism * 0.5), 1), 4);
}

/** @internal */
export class _NodeDracoWorkerPool extends WorkerPool {
    private readonly _actions: Array<WorkerAction | undefined> = [];
    private readonly _slots: WorkerSlot[] = [];
    private _actionHead = 0;
    private _disposed = false;

    public constructor(
        private readonly _maxWorkers: number,
        private readonly _createWorkerAsync: (onFatalError: (error: unknown) => void) => Promise<_ManagedNodeWorker>,
        private readonly _idleWorkerLifetimeMilliseconds = IdleWorkerLifetimeMilliseconds
    ) {
        super([]);
    }

    public override push(action: WorkerAction): void {
        if (this._disposed) {
            throw new Error("The Node Draco worker pool is disposed.");
        }
        this._actions.push(action);
        this._dispatch();
    }

    public override dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        const error = new Error("The Node Draco worker pool was disposed.");
        for (let action = this._takeNextAction(); action !== undefined; action = this._takeNextAction()) {
            this._runFailedAction(action, error);
        }
        for (const slot of [...this._slots]) {
            this._removeSlot(slot);
            const action = slot.action;
            delete slot.action;
            if (action !== undefined) {
                if (slot.actionStarted) {
                    slot.worker?.dispatchFailure(error);
                } else {
                    this._runFailedAction(action, error);
                }
            }
            void slot.initialization?.then(
                (worker) => {
                    worker.terminate();
                },
                () => undefined
            );
        }
    }

    private _dispatch(): void {
        if (this._disposed) {
            return;
        }
        while (this._hasQueuedActions()) {
            const idleSlot = this._slots.find((slot) => !slot.busy && !slot.removed);
            if (idleSlot === undefined && this._slots.length >= this._maxWorkers) {
                return;
            }
            const action = this._takeNextAction();
            if (action === undefined) {
                return;
            }
            const slot = idleSlot ?? this._createSlot();
            if (idleSlot === undefined) {
                this._slots.push(slot);
            }
            this._runAction(slot, action);
        }
    }

    private _createSlot(): WorkerSlot {
        const slot: WorkerSlot = {
            actionStarted: false,
            busy: false,
            removed: false,
        };
        slot.initialization = this._createWorkerAsync((error) => this._handleFatalWorkerError(slot, error)).then((worker) => {
            slot.worker = worker;
            return worker;
        });
        return slot;
    }

    private _runAction(slot: WorkerSlot, action: WorkerAction): void {
        slot.action = action;
        slot.actionStarted = false;
        slot.busy = true;
        if (slot.idleTimer !== undefined) {
            clearTimeout(slot.idleTimer);
            delete slot.idleTimer;
        }

        const initialization = slot.initialization;
        if (initialization === undefined) {
            throw new Error("The Node Draco worker slot was not initialized.");
        }
        void initialization.then(
            (worker) => {
                if (this._disposed || slot.removed) {
                    worker.terminate();
                    if (slot.action === action) {
                        delete slot.action;
                        this._runFailedAction(
                            action,
                            this._disposed ? new Error("The Node Draco worker pool was disposed.") : new Error("The Node Draco worker stopped during initialization.")
                        );
                    }
                    return;
                }
                worker.ref();
                slot.actionStarted = true;
                let completed = false;
                const onComplete = () => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    if (slot.action === action) {
                        delete slot.action;
                    }
                    this._completeAction(slot);
                };
                try {
                    action(worker, onComplete);
                } catch (error) {
                    worker.dispatchFailure(error);
                    onComplete();
                }
            },
            (error) => {
                this._removeSlot(slot);
                if (slot.action === action) {
                    delete slot.action;
                    this._runFailedAction(action, error);
                }
                this._failQueuedActions(error);
            }
        );
    }

    private _completeAction(slot: WorkerSlot): void {
        if (slot.removed) {
            this._dispatch();
            return;
        }
        slot.busy = false;
        slot.actionStarted = false;
        const worker = slot.worker;
        if (worker?.dead) {
            this._removeSlot(slot);
        } else if (worker) {
            worker.unref();
            slot.idleTimer = setTimeout(() => {
                this._removeSlot(slot);
                worker.terminate();
            }, this._idleWorkerLifetimeMilliseconds);
            slot.idleTimer.unref();
        }
        this._dispatch();
    }

    private _handleFatalWorkerError(slot: WorkerSlot, _error: unknown): void {
        this._removeSlot(slot);
        if (!slot.busy) {
            this._dispatch();
        }
    }

    private _removeSlot(slot: WorkerSlot): void {
        if (slot.removed) {
            return;
        }
        slot.removed = true;
        if (slot.idleTimer !== undefined) {
            clearTimeout(slot.idleTimer);
            delete slot.idleTimer;
        }
        const index = this._slots.indexOf(slot);
        if (index !== -1) {
            this._slots.splice(index, 1);
        }
    }

    private _runFailedAction(action: WorkerAction, error: unknown): void {
        const worker = new FailedWorker(error);
        let completed = false;
        try {
            action(worker, () => {
                completed = true;
            });
        } catch (actionError) {
            worker.dispatchFailure(actionError);
        }
        if (!completed) {
            worker.dispatchFailure(error);
        }
    }

    private _failQueuedActions(error: unknown): void {
        for (let action = this._takeNextAction(); action !== undefined; action = this._takeNextAction()) {
            this._runFailedAction(action, error);
        }
    }

    private _takeNextAction(): WorkerAction | undefined {
        if (this._actionHead >= this._actions.length) {
            this._actions.length = 0;
            this._actionHead = 0;
            return undefined;
        }
        const action = this._actions[this._actionHead];
        this._actions[this._actionHead] = undefined;
        this._actionHead++;
        return action;
    }

    private _hasQueuedActions(): boolean {
        if (this._actionHead < this._actions.length) {
            return true;
        }
        this._actions.length = 0;
        this._actionHead = 0;
        return false;
    }
}

class NodeWorkerAdapter extends EventTarget implements _ManagedNodeWorker {
    public onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null;
    public onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null;
    public onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null;
    public dead = false;
    private _terminating = false;

    public constructor(
        private readonly _worker: NodeWorker,
        private readonly _onFatalError: (error: unknown) => void
    ) {
        super();
        _worker.on("message", (data) => {
            const event = new MessageEvent("message", { data });
            this.dispatchEvent(event);
            this.onmessage?.call(this, event);
        });
        _worker.on("messageerror", (error) => {
            const event = new MessageEvent("messageerror", { data: error });
            this.dispatchEvent(event);
            this.onmessageerror?.call(this, event);
            this._handleFatalError(error, true);
        });
        _worker.once("error", (error) => this._handleFatalError(error, true));
        _worker.once("exit", (code) => {
            if (!this._terminating && !this.dead) {
                this._handleFatalError(new Error(`The Node Draco worker exited unexpectedly with code ${code}.`), false);
            }
        });
    }

    public postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        if (this.dead) {
            throw new Error("The Node Draco worker is not running.");
        }
        if (Array.isArray(transferOrOptions)) {
            const transferList = transferOrOptions.map((item) => {
                if (!(item instanceof ArrayBuffer)) {
                    throw new TypeError("The Node Draco worker only supports ArrayBuffer transfers.");
                }
                return item;
            });
            this._worker.postMessage(message, transferList);
            return;
        }
        if (transferOrOptions?.transfer !== undefined) {
            this.postMessage(message, transferOrOptions.transfer);
            return;
        }
        this._worker.postMessage(message);
    }

    public terminate(): void {
        if (this._terminating) {
            return;
        }
        this._terminating = true;
        this.dead = true;
        void this._worker.terminate();
    }

    public ref(): void {
        this._worker.ref();
    }

    public unref(): void {
        this._worker.unref();
    }

    public dispatchFailure(error: unknown): void {
        const event = new NodeWorkerErrorEvent(error);
        this.dispatchEvent(event);
        this.onerror?.call(this, event);
    }

    private _handleFatalError(error: unknown, terminateWorker: boolean): void {
        if (this.dead) {
            return;
        }
        this.dead = true;
        if (terminateWorker && !this._terminating) {
            this._terminating = true;
            void this._worker.terminate();
        }
        this.dispatchFailure(error);
        this._onFatalError(error);
    }
}

class FailedWorker extends EventTarget implements Worker {
    public onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null;
    public onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null;
    public onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null;

    public constructor(private readonly _error: unknown) {
        super();
    }

    public postMessage(_message: unknown, _transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        throw this._error;
    }

    public terminate(): void {}

    public dispatchFailure(error: unknown): void {
        const event = new NodeWorkerErrorEvent(error);
        this.dispatchEvent(event);
        this.onerror?.call(this, event);
    }
}

class NodeWorkerErrorEvent extends Event implements ErrorEvent {
    public readonly colno = 0;
    public readonly filename = "";
    public readonly lineno = 0;
    public readonly message: string;

    public constructor(public readonly error: unknown) {
        super("error");
        this.message = error instanceof Error ? error.message : String(error);
    }
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
