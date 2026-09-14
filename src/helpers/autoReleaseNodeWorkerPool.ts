import { WorkerPool } from "@babylonjs/core/Misc/workerPool.js";
import type { Worker as NodeWorker } from "node:worker_threads";

type WorkerAction = (worker: Worker, onComplete: () => void) => void;

export interface ManagedNodeWorker extends Worker {
    readonly dead: boolean;
    dispatchFailure(error: unknown): void;
    ref(): void;
    unref(): void;
}

export interface NodeWorkerInitialization {
    readonly ready: Promise<void>;
    readonly worker: ManagedNodeWorker;
}

interface WorkerSlot {
    action?: WorkerAction;
    actionStarted: boolean;
    busy: boolean;
    idleTimer?: ReturnType<typeof setTimeout>;
    initialization?: Promise<ManagedNodeWorker>;
    removed: boolean;
    worker?: ManagedNodeWorker;
}

const IdleWorkerLifetimeMilliseconds = 1000;
const QueueCompactionThreshold = 1024;
const WorkerFailureRetryDelayMilliseconds = 100;

export function getDefaultNodeWorkerCount(availableParallelism: number): number {
    return Math.min(Math.max(Math.floor(availableParallelism * 0.5), 1), 4);
}

export function createNodeWorkerAdapter(worker: NodeWorker, onFatalError: (error: unknown) => void): ManagedNodeWorker {
    return new NodeWorkerAdapter(worker, onFatalError);
}

export class AutoReleaseNodeWorkerPool extends WorkerPool {
    private _actions: Array<WorkerAction | undefined> = [];
    private readonly _slots: WorkerSlot[] = [];
    private _actionHead = 0;
    private _disposed = false;
    private _failure?: unknown;
    private _failureTimer?: ReturnType<typeof setTimeout>;

    public constructor(
        private readonly _maxWorkers: number,
        private readonly _createWorker: (onFatalError: (error: unknown) => void) => NodeWorkerInitialization,
        private readonly _idleWorkerLifetimeMilliseconds = IdleWorkerLifetimeMilliseconds,
        private readonly _failureRetryDelayMilliseconds = WorkerFailureRetryDelayMilliseconds
    ) {
        super([]);
    }

    public override push(action: WorkerAction): void {
        if (this._disposed) {
            throw new Error("The Node worker pool is disposed.");
        }
        if (this._failure !== undefined) {
            this._runFailedAction(action, this._failure);
            return;
        }
        this._actions.push(action);
        this._dispatch();
    }

    public override dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        if (this._failureTimer !== undefined) {
            clearTimeout(this._failureTimer);
            delete this._failureTimer;
        }
        delete this._failure;
        const error = new Error("The Node worker pool was disposed.");
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
                    slot.worker?.dispatchFailure(error);
                }
            }
            slot.worker?.terminate();
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
            let slot: WorkerSlot;
            try {
                slot = idleSlot ?? this._createSlot();
            } catch (error) {
                this._runFailedAction(action, error);
                this._recordFailure(error);
                return;
            }
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
        const initialization = this._createWorker((error) => this._handleFatalWorkerError(slot, error));
        slot.worker = initialization.worker;
        slot.initialization = initialization.ready.then(() => initialization.worker);
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
            throw new Error("The Node worker slot was not initialized.");
        }
        void initialization.then(
            (worker) => {
                const pendingAction = slot.action;
                if (this._disposed || slot.removed) {
                    worker.terminate();
                    if (pendingAction !== undefined) {
                        delete slot.action;
                        this._runFailedAction(
                            pendingAction,
                            this._disposed ? new Error("The Node worker pool was disposed.") : new Error("The Node worker stopped during initialization.")
                        );
                    }
                    return;
                }
                worker.ref();
                slot.actionStarted = true;
                if (pendingAction === undefined) {
                    worker.terminate();
                    return;
                }
                let completed = false;
                const onComplete = () => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    delete slot.action;
                    this._completeAction(slot);
                };
                try {
                    pendingAction(worker, onComplete);
                } catch (error) {
                    worker.dispatchFailure(error);
                    onComplete();
                }
            },
            (error) => {
                const pendingAction = slot.action;
                this._removeSlot(slot);
                slot.worker?.terminate();
                if (pendingAction !== undefined) {
                    delete slot.action;
                    this._runFailedAction(pendingAction, error);
                }
                this._recordFailure(error);
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

    private _handleFatalWorkerError(slot: WorkerSlot, error: unknown): void {
        this._removeSlot(slot);
        this._recordFailure(error);
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

    private _recordFailure(error: unknown): void {
        if (this._disposed) {
            return;
        }
        this._failure = error;
        this._failQueuedActions(error);
        if (this._failureTimer !== undefined) {
            clearTimeout(this._failureTimer);
        }
        this._failureTimer = setTimeout(() => {
            delete this._failure;
            delete this._failureTimer;
        }, this._failureRetryDelayMilliseconds);
        this._failureTimer.unref();
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
        if (this._actionHead >= QueueCompactionThreshold && this._actionHead * 2 >= this._actions.length) {
            this._actions = this._actions.slice(this._actionHead);
            this._actionHead = 0;
        }
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

class NodeWorkerAdapter extends EventTarget implements ManagedNodeWorker {
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
                this._handleFatalError(new Error(`The Node worker exited unexpectedly with code ${code}.`), false);
            }
        });
    }

    public postMessage(message: unknown, transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        if (this.dead) {
            throw new Error("The Node worker is not running.");
        }
        if (Array.isArray(transferOrOptions)) {
            const transferList = transferOrOptions.map((item) => {
                if (!(item instanceof ArrayBuffer)) {
                    throw new TypeError("The Node worker only supports ArrayBuffer transfers.");
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
        this._onFatalError(error);
        this.dispatchFailure(error);
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
