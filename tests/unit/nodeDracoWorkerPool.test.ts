import { describe, expect, it } from "vitest";

import { _getNodeWorkerCount, _NodeDracoWorkerPool, type _ManagedNodeWorker } from "../../src/helpers/nodeDracoWorkerPool";

describe("Node Draco worker pool", () => {
    it("uses half the available processors with bounds", () => {
        expect(_getNodeWorkerCount(1)).toBe(1);
        expect(_getNodeWorkerCount(6)).toBe(3);
        expect(_getNodeWorkerCount(12)).toBe(4);
    });

    it("rejects a worker startup failure and retries with a new worker", async () => {
        let attempts = 0;
        const pool = new _NodeDracoWorkerPool(1, async (onFatalError) => {
            attempts++;
            if (attempts === 1) {
                throw new Error("startup failed");
            }
            return new FakeWorker(onFatalError, (worker) => worker.sendSuccess());
        });

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(2);
        pool.dispose();
    });

    it("rejects a queued batch after one startup failure without repeated worker churn", async () => {
        let attempts = 0;
        const pool = new _NodeDracoWorkerPool(1, async () => {
            attempts++;
            throw new Error("startup failed");
        });

        const results = await Promise.allSettled(Array.from({ length: 20 }, () => runActionAsync(pool)));

        expect(results.every((result) => result.status === "rejected")).toBe(true);
        expect(attempts).toBe(1);
        pool.dispose();
    });

    it("recovers after an active worker exits unexpectedly", async () => {
        let attempts = 0;
        const pool = new _NodeDracoWorkerPool(1, async (onFatalError) => {
            attempts++;
            return attempts === 1
                ? new FakeWorker(onFatalError, (worker) => queueMicrotask(() => worker.fail(new Error("worker exited"))))
                : new FakeWorker(onFatalError, (worker) => worker.sendSuccess());
        });

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(2);
        pool.dispose();
    });

    it("settles synchronous post failures without discarding a healthy worker", async () => {
        let posts = 0;
        let attempts = 0;
        const pool = new _NodeDracoWorkerPool(1, async (onFatalError) => {
            attempts++;
            return new FakeWorker(onFatalError, (worker) => {
                posts++;
                if (posts === 1) {
                    throw new Error("post failed");
                }
                worker.sendSuccess();
            });
        });

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(1);
        pool.dispose();
    });

    it("does not create more workers than its bound", async () => {
        let workersCreated = 0;
        const completions: Array<() => void> = [];
        const pool = new _NodeDracoWorkerPool(2, async (onFatalError) => {
            workersCreated++;
            return new FakeWorker(onFatalError, () => undefined);
        });

        for (let index = 0; index < 6; index++) {
            pool.push((_worker, onComplete) => completions.push(onComplete));
        }
        await waitForAsync(() => completions.length === 2);

        expect(workersCreated).toBe(2);
        completions.shift()?.();
        await waitForAsync(() => completions.length === 2);
        expect(workersCreated).toBe(2);
        pool.dispose();
    });

    it("unrefs idle workers, terminates them, and creates replacements later", async () => {
        const workers: FakeWorker[] = [];
        const pool = new _NodeDracoWorkerPool(
            1,
            async (onFatalError) => {
                const worker = new FakeWorker(onFatalError, (currentWorker) => currentWorker.sendSuccess());
                workers.push(worker);
                return worker;
            },
            10
        );

        await runActionAsync(pool);
        expect(workers[0]?.unrefCount).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(workers[0]?.terminated).toBe(true);

        await runActionAsync(pool);
        expect(workers).toHaveLength(2);
        pool.dispose();
    });

    it("settles an action when disposed during worker initialization", async () => {
        let resolveWorker: ((worker: FakeWorker) => void) | undefined;
        const pool = new _NodeDracoWorkerPool(
            1,
            (onFatalError) =>
                new Promise((resolve) => {
                    resolveWorker = () => resolve(new FakeWorker(onFatalError, (worker) => worker.sendSuccess()));
                })
        );
        const result = runActionAsync(pool);

        pool.dispose();

        await expect(result).rejects.toBeDefined();
        resolveWorker?.(
            new FakeWorker(
                () => undefined,
                () => undefined
            )
        );
    });
});

function runActionAsync(pool: _NodeDracoWorkerPool): Promise<unknown> {
    return new Promise((resolve, reject) => {
        pool.push((worker, onComplete) => {
            const cleanup = () => {
                worker.removeEventListener("error", onError);
                worker.removeEventListener("message", onMessage);
            };
            const onError = (event: ErrorEvent) => {
                cleanup();
                reject(event);
                onComplete();
            };
            const onMessage = (event: MessageEvent) => {
                cleanup();
                resolve(event.data);
                onComplete();
            };
            worker.addEventListener("error", onError);
            worker.addEventListener("message", onMessage);
            worker.postMessage({ id: "test" });
        });
    });
}

async function waitForAsync(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error("Timed out waiting for the worker pool.");
}

class FakeWorker extends EventTarget implements _ManagedNodeWorker {
    public onerror: ((this: AbstractWorker, event: ErrorEvent) => unknown) | null = null;
    public onmessage: ((this: Worker, event: MessageEvent) => unknown) | null = null;
    public onmessageerror: ((this: Worker, event: MessageEvent) => unknown) | null = null;
    public dead = false;
    public refCount = 0;
    public terminated = false;
    public unrefCount = 0;

    public constructor(
        private readonly _onFatalError: (error: unknown) => void,
        private readonly _postMessage: (worker: FakeWorker) => void
    ) {
        super();
    }

    public postMessage(_message: unknown, _transferOrOptions?: Transferable[] | StructuredSerializeOptions): void {
        this._postMessage(this);
    }

    public terminate(): void {
        this.dead = true;
        this.terminated = true;
    }

    public ref(): void {
        this.refCount++;
    }

    public unref(): void {
        this.unrefCount++;
    }

    public dispatchFailure(_error: unknown): void {
        this.dispatchEvent(new Event("error"));
    }

    public sendSuccess(): void {
        this.dispatchEvent(new MessageEvent("message", { data: "done" }));
    }

    public fail(error: unknown): void {
        this.dead = true;
        this.dispatchFailure(error);
        this._onFatalError(error);
    }
}
