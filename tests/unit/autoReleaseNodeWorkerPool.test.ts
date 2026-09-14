import { describe, expect, it } from "vitest";

import { AutoReleaseNodeWorkerPool, getDefaultNodeWorkerCount, type ManagedNodeWorker } from "../../src/helpers/autoReleaseNodeWorkerPool";

describe("AutoReleaseNodeWorkerPool", () => {
    it("uses half the available processors with bounds", () => {
        expect(getDefaultNodeWorkerCount(1)).toBe(1);
        expect(getDefaultNodeWorkerCount(6)).toBe(3);
        expect(getDefaultNodeWorkerCount(12)).toBe(4);
    });

    it("rejects a worker startup failure and retries with a new worker later", async () => {
        let attempts = 0;
        const pool = new AutoReleaseNodeWorkerPool(
            1,
            (onFatalError) => {
                attempts++;
                const worker = new FakeWorker(onFatalError, (currentWorker) => currentWorker.sendSuccess());
                return {
                    worker,
                    ready: attempts === 1 ? Promise.reject(new Error("startup failed")) : Promise.resolve(),
                };
            },
            1000,
            10
        );

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).rejects.toBeDefined();
        expect(attempts).toBe(1);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(2);
        pool.dispose();
    });

    it("rejects delayed actions after startup failure without repeated worker churn", async () => {
        let attempts = 0;
        const pool = new AutoReleaseNodeWorkerPool(
            1,
            (onFatalError) => {
                attempts++;
                const worker = new FakeWorker(onFatalError, () => undefined);
                return { ready: Promise.reject(new Error("startup failed")), worker };
            },
            1000,
            20
        );

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        for (let index = 0; index < 5; index++) {
            await new Promise((resolve) => setImmediate(resolve));
            await expect(runActionAsync(pool)).rejects.toBeDefined();
        }
        expect(attempts).toBe(1);
        pool.dispose();
    });

    it("rejects a queued batch after one startup failure without repeated worker churn", async () => {
        let attempts = 0;
        const pool = new AutoReleaseNodeWorkerPool(1, (onFatalError) => {
            attempts++;
            const worker = new FakeWorker(onFatalError, () => undefined);
            return { ready: Promise.reject(new Error("startup failed")), worker };
        });

        const results = await Promise.allSettled(Array.from({ length: 20 }, () => runActionAsync(pool)));

        expect(results.every((result) => result.status === "rejected")).toBe(true);
        expect(attempts).toBe(1);
        pool.dispose();
    });

    it("recovers after an active worker exits unexpectedly", async () => {
        let attempts = 0;
        const pool = new AutoReleaseNodeWorkerPool(
            1,
            (onFatalError) => {
                attempts++;
                const worker =
                    attempts === 1
                        ? new FakeWorker(onFatalError, (currentWorker) => queueMicrotask(() => currentWorker.fail(new Error("worker exited"))))
                        : new FakeWorker(onFatalError, (currentWorker) => currentWorker.sendSuccess());
                return { ready: Promise.resolve(), worker };
            },
            1000,
            10
        );

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await new Promise((resolve) => setTimeout(resolve, 20));
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(2);
        pool.dispose();
    });

    it("settles synchronous post failures without discarding a healthy worker", async () => {
        let posts = 0;
        let attempts = 0;
        const pool = new AutoReleaseNodeWorkerPool(1, (onFatalError) => {
            attempts++;
            const worker = new FakeWorker(onFatalError, (currentWorker) => {
                posts++;
                if (posts === 1) {
                    throw new Error("post failed");
                }
                currentWorker.sendSuccess();
            });
            return { ready: Promise.resolve(), worker };
        });

        await expect(runActionAsync(pool)).rejects.toBeDefined();
        await expect(runActionAsync(pool)).resolves.toBe("done");
        expect(attempts).toBe(1);
        pool.dispose();
    });

    it("does not create more workers than its bound", async () => {
        let workersCreated = 0;
        const completions: Array<() => void> = [];
        const pool = new AutoReleaseNodeWorkerPool(2, (onFatalError) => {
            workersCreated++;
            const worker = new FakeWorker(onFatalError, () => undefined);
            return { ready: Promise.resolve(), worker };
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
        const pool = new AutoReleaseNodeWorkerPool(
            1,
            (onFatalError) => {
                const worker = new FakeWorker(onFatalError, (currentWorker) => currentWorker.sendSuccess());
                workers.push(worker);
                return { ready: Promise.resolve(), worker };
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

    it("settles an action and terminates its worker when disposed during initialization", async () => {
        let resolveInitialization: (() => void) | undefined;
        let worker: FakeWorker | undefined;
        const pool = new AutoReleaseNodeWorkerPool(1, (onFatalError) => {
            worker = new FakeWorker(onFatalError, (currentWorker) => currentWorker.sendSuccess());
            return {
                ready: new Promise((resolve) => {
                    resolveInitialization = resolve;
                }),
                worker,
            };
        });
        const result = runActionAsync(pool);

        pool.dispose();

        await expect(result).rejects.toBeDefined();
        expect(worker?.terminated).toBe(true);
        resolveInitialization?.();
    });
});

function runActionAsync(pool: AutoReleaseNodeWorkerPool): Promise<unknown> {
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

class FakeWorker extends EventTarget implements ManagedNodeWorker {
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
