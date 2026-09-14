import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.pure.js";

import { describe, expect, expectTypeOf, it } from "vitest";

import { Block } from "../../src/blocks/block";
import { defineBlock, defineSourceBlock } from "../../src/blocks/blockDefinition";
import { BabylonSceneType } from "../../src/connectionPoints/babylonScene";
import { FileType } from "../../src/connectionPoints/file";
import { NodeAsset, NodeAssetContext } from "../../src/index";
import type { Resource } from "../../src/resources/resource";
import { ScaleDefinition, NumberDefinition } from "../helpers/numberBlocks";

describe("NodeAsset", () => {
    it("treats an unconnected input as a graph input", async () => {
        const block = new Block(ScaleDefinition);
        const nodeAsset = new NodeAsset({ name: "external-input", outputBlock: block });
        const context = new NodeAssetContext(nodeAsset);
        context.setInput(block, 3);

        const result = nodeAsset.executeAsync(context);

        expectTypeOf(result).toEqualTypeOf<Promise<number>>();
        await expect(result).resolves.toBe(6);
    });

    it("rejects execution without a required input value", async () => {
        const block = new Block(NumberDefinition);
        const nodeAsset = new NodeAsset({ name: "missing-input", outputBlock: block });

        await expect(nodeAsset.executeAsync()).rejects.toThrow();
    });

    it("executes a source block without a user input", async () => {
        const valueResource = {
            name: "source-value",
            create: () => 5,
            dispose: () => undefined,
        } satisfies Resource<number>;
        const sourceDefinition = defineSourceBlock({
            type: "source",
            output: NumberDefinition.output,
            resources: { value: valueResource },
            run: (_config, { value }) => value,
        });
        const source = new Block(sourceDefinition);
        const nodeAsset = new NodeAsset({ name: "source", outputBlock: source });

        expectTypeOf(source.input).toEqualTypeOf<undefined>();
        expect(source.input).toBeUndefined();
        await expect(nodeAsset.executeAsync()).resolves.toBe(5);
    });

    it("rejects context inputs outside the node asset", () => {
        const firstBlock = new Block(NumberDefinition, { input: 1 });
        const firstNodeAsset = new NodeAsset({ name: "first", outputBlock: firstBlock });
        const secondBlock = new Block(NumberDefinition, { input: 2 });

        const context = new NodeAssetContext(firstNodeAsset);

        expect(() => context.setInput(secondBlock, 3)).toThrow();
    });

    it("rejects context values for connected inputs", () => {
        const source = new Block(NumberDefinition, { input: 1 });
        const destination = new Block(NumberDefinition);
        source.output.connectTo(destination.input);
        const nodeAsset = new NodeAsset({ name: "connected-input", outputBlock: destination });
        const context = new NodeAssetContext(nodeAsset);

        expect(() => context.setInput(destination, 3)).toThrow();
    });

    it("executes node assets with independent context inputs", async () => {
        const inputBlock = new Block(NumberDefinition, { input: 2 });
        const scaleBlock = new Block(ScaleDefinition, { scale: "triple" });
        const outputBlock = new Block(NumberDefinition);

        inputBlock.output.connectTo(scaleBlock.input);
        scaleBlock.output.connectTo(outputBlock.input);

        const nodeAsset = new NodeAsset({ name: "number-pipeline", outputBlock });

        const context = new NodeAssetContext(nodeAsset);
        context.setInput(inputBlock, 4);

        const [defaultResult, contextResult] = await Promise.all([nodeAsset.executeAsync(), nodeAsset.executeAsync(context)]);

        expect(defaultResult).toBe(6);
        expect(contextResult).toBe(12);
    });

    it("executes connected optional auxiliary inputs", async () => {
        const addDefinition = defineBlock({
            type: "add",
            input: NumberDefinition.input,
            auxiliaryInputs: {
                addend: NumberDefinition.input,
            },
            output: NumberDefinition.output,
            run: (input, _config, _resources, { addend }) => input + (addend ?? 0),
        });
        const addendDefinition = defineSourceBlock({
            type: "addend-source",
            output: NumberDefinition.output,
            run: () => 3,
        });
        const addend = new Block(addendDefinition);
        const add = new Block(addDefinition, { input: 4 });
        add.auxiliaryInputs.addend.connectTo(addend.output);
        const nodeAsset = new NodeAsset({ name: "auxiliary-input", outputBlock: add });

        await expect(nodeAsset.executeAsync()).resolves.toBe(7);
    });

    it("passes undefined for an unconnected optional auxiliary input", async () => {
        let receivedOptional: number | undefined;
        const definition = defineBlock({
            type: "optional-auxiliary-input",
            input: NumberDefinition.input,
            auxiliaryInputs: { optional: NumberDefinition.input },
            output: NumberDefinition.output,
            run: (input, _config, _resources, { optional }) => {
                receivedOptional = optional;
                return input;
            },
        });
        const block = new Block(definition, { input: 4 });

        await expect(new NodeAsset({ name: "optional-auxiliary-input", outputBlock: block }).executeAsync()).resolves.toBe(4);
        expect(receivedOptional).toBeUndefined();
    });

    it("captures auxiliary input topology at construction", async () => {
        const definition = defineBlock({
            type: "captured-auxiliary-input",
            input: NumberDefinition.input,
            auxiliaryInputs: { addend: NumberDefinition.input },
            output: NumberDefinition.output,
            run: (input, _config, _resources, { addend }) => input + (addend ?? 0),
        });
        const source = new Block(NumberDefinition, { input: 3 });
        const destination = new Block(definition, { input: 4 });
        source.output.connectTo(destination.auxiliaryInputs.addend);
        const nodeAsset = new NodeAsset({ name: "captured-auxiliary-input", outputBlock: destination });

        source.output.disconnectFrom(destination.auxiliaryInputs.addend);

        await expect(nodeAsset.executeAsync()).resolves.toBe(7);
    });

    it("allows the same blocks to execute in a new asset after disposal", async () => {
        const source = new Block(NumberDefinition, { input: 2 });
        const output = new Block(NumberDefinition);
        source.output.connectTo(output.input);
        const firstAsset = new NodeAsset({ name: "disposable", outputBlock: output });

        firstAsset.dispose();
        firstAsset.dispose();
        const secondAsset = new NodeAsset({ name: "reused-blocks", outputBlock: output });

        await expect(secondAsset.executeAsync()).resolves.toBe(2);
    });

    it("rejects execution after disposal", async () => {
        const block = new Block(NumberDefinition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "disposed-execution", outputBlock: block });

        nodeAsset.dispose();

        await expect(nodeAsset.executeAsync()).rejects.toThrow();
    });

    it("resolves shared resource dependencies once and disposes dependents first", async () => {
        const events: string[] = [];
        const multiplierResource = {
            name: "multiplier",
            create: () => {
                events.push("create multiplier");
                return 2;
            },
            dispose: () => {
                events.push("dispose multiplier");
            },
        } satisfies Resource<number>;
        const calculatorResource = {
            name: "calculator",
            dependencies: { multiplier: multiplierResource },
            create: ({ multiplier }) => {
                expectTypeOf(multiplier).toEqualTypeOf<number>();
                events.push("create calculator");
                return (value: number) => value * multiplier;
            },
            dispose: () => {
                events.push("dispose calculator");
            },
        } satisfies Resource<(value: number) => number, { readonly multiplier: typeof multiplierResource }>;
        let calculatorsWereShared = false;
        const definition = defineBlock({
            type: "resource-consumer",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: {
                calculator: calculatorResource,
                sameCalculator: calculatorResource,
            },
            run: (input, _config, { calculator, sameCalculator }) => {
                expectTypeOf(calculator).toEqualTypeOf<(value: number) => number>();
                calculatorsWereShared = calculator === sameCalculator;
                events.push("run");
                return calculator(input);
            },
        });
        const block = new Block(definition, { input: 3 });
        const nodeAsset = new NodeAsset({ name: "resources", outputBlock: block });

        await expect(nodeAsset.executeAsync()).resolves.toBe(6);
        expect(calculatorsWereShared).toBe(true);
        expect(events).toEqual(["create multiplier", "create calculator", "run", "dispose calculator", "dispose multiplier"]);
    });

    it("isolates resources between concurrent executions", async () => {
        let nextId = 0;
        const disposedIds: number[] = [];
        const resource = {
            name: "execution-resource",
            create: () => ({ id: ++nextId }),
            dispose: ({ id }) => {
                disposedIds.push(id);
            },
        } satisfies Resource<{ id: number }>;
        const definition = defineBlock({
            type: "execution-resource-consumer",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: { resource },
            run: (_input, _config, { resource: { id } }) => id,
        });
        const block = new Block(definition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "isolated-resources", outputBlock: block });

        expect(nextId).toBe(0);
        const results = await Promise.all([nodeAsset.executeAsync(), nodeAsset.executeAsync()]);

        expect(results.sort()).toEqual([1, 2]);
        expect(disposedIds.sort()).toEqual([1, 2]);
    });

    it("cleans file-output resources before resolving", async () => {
        const events: string[] = [];
        const resource = {
            name: "file-output-resource",
            create: () => {
                events.push("create");
                return {};
            },
            dispose: () => {
                events.push("dispose");
            },
        } satisfies Resource<object>;
        const definition = defineSourceBlock({
            type: "file-output",
            output: FileType,
            resources: { resource },
            run: () => {
                events.push("run");
                return new File(["result"], "result.txt");
            },
        });
        const asset = new NodeAsset({ name: "file-output", outputBlock: new Block(definition) });

        await expect(asset.executeAsync()).resolves.toBeInstanceOf(File);
        expect(events).toEqual(["create", "run", "dispose"]);
    });

    it("disposes retained resources when an execution-owned terminal scene is disposed", async () => {
        const events: string[] = [];
        let notifyCleanupStarted: (() => void) | undefined;
        const cleanupStarted = new Promise<void>((resolve) => {
            notifyCleanupStarted = resolve;
        });
        const engineResource = {
            name: "owned-engine",
            create: () => new NullEngine(),
            dispose: (engine) => {
                events.push("dispose engine");
                engine.dispose();
            },
        } satisfies Resource<NullEngine>;
        const retainedResource = {
            name: "retained-resource",
            create: () => ({}),
            dispose: () => {
                events.push("dispose retained resource");
                notifyCleanupStarted?.();
            },
        } satisfies Resource<object>;
        const definition = defineSourceBlock({
            type: "owned-scene",
            output: BabylonSceneType,
            resources: { engine: engineResource, retainedResource },
            run: (_config, { engine }) => {
                const scene = new Scene(engine);
                scene.onDisposeObservable.add((_disposedScene, eventState) => {
                    eventState.skipNextObservers = true;
                });
                return scene;
            },
        });
        const asset = new NodeAsset({ name: "owned-scene", outputBlock: new Block(definition) });

        const scene = await asset.executeAsync();
        const siblingScene = new Scene(scene.getEngine());

        expect(events).toEqual([]);
        expect(scene.isDisposed).toBe(false);
        expect(siblingScene.isDisposed).toBe(false);

        scene.dispose();
        await cleanupStarted;

        expect(scene.isDisposed).toBe(true);
        await asset.disposeSceneAsync(scene);

        expect(events).toEqual(["dispose retained resource", "dispose engine"]);
        expect(siblingScene.isDisposed).toBe(true);
    });

    it("leaves caller-owned scenes and engines untouched", async () => {
        const events: string[] = [];
        const unrelatedResource = {
            name: "unrelated-resource",
            create: () => ({}),
            dispose: () => {
                events.push("dispose unrelated resource");
            },
        } satisfies Resource<object>;
        const definition = defineBlock({
            type: "external-scene",
            input: BabylonSceneType,
            output: BabylonSceneType,
            resources: { unrelatedResource },
            run: (scene) => scene,
        });
        const engine = new NullEngine();
        const scene = new Scene(engine);
        const asset = new NodeAsset({ name: "external-scene", outputBlock: new Block(definition, { input: scene }) });

        try {
            await expect(asset.executeAsync()).resolves.toBe(scene);
            expect(events).toEqual(["dispose unrelated resource"]);

            await asset.disposeSceneAsync(scene);

            expect(scene.isDisposed).toBe(false);
            expect(engine.isDisposed).toBe(false);
        } finally {
            scene.dispose();
            engine.dispose();
        }
    });

    it("keeps concurrent scene executions independently owned", async () => {
        let cleanupCount = 0;
        const engineResource = {
            name: "independent-engine",
            create: () => new NullEngine(),
            dispose: (engine) => {
                cleanupCount++;
                engine.dispose();
            },
        } satisfies Resource<NullEngine>;
        const definition = defineSourceBlock({
            type: "independent-scene",
            output: BabylonSceneType,
            resources: { engine: engineResource },
            run: (_config, { engine }) => new Scene(engine),
        });
        const asset = new NodeAsset({ name: "independent-scenes", outputBlock: new Block(definition) });

        const [firstScene, secondScene] = await Promise.all([asset.executeAsync(), asset.executeAsync()]);
        firstScene.dispose();
        await asset.disposeSceneAsync(firstScene);

        expect(firstScene.isDisposed).toBe(true);
        expect(secondScene.isDisposed).toBe(false);
        expect(cleanupCount).toBe(1);

        const firstCleanup = asset.disposeSceneAsync(secondScene);
        await Promise.resolve();

        expect(secondScene.isDisposed).toBe(false);
        expect(cleanupCount).toBe(1);

        secondScene.dispose();
        const secondCleanup = asset.disposeSceneAsync(secondScene);

        expect(firstCleanup).toBe(secondCleanup);
        await Promise.all([firstCleanup, secondCleanup]);
        expect(secondScene.isDisposed).toBe(true);
        expect(cleanupCount).toBe(2);
    });

    it("publishes the cleanup promise before scene disposal can reenter", async () => {
        let cleanupCount = 0;
        const engineResource = {
            name: "reentrant-engine",
            create: () => new NullEngine(),
            dispose: (engine) => {
                cleanupCount++;
                engine.dispose();
            },
        } satisfies Resource<NullEngine>;
        const definition = defineSourceBlock({
            type: "reentrant-scene",
            output: BabylonSceneType,
            resources: { engine: engineResource },
            run: (_config, { engine }) => new Scene(engine),
        });
        const asset = new NodeAsset({ name: "reentrant-scene", outputBlock: new Block(definition) });
        const scene = await asset.executeAsync();
        let reentrantCleanup: Promise<void> | undefined;
        let didReenter = false;
        scene.onDisposeObservable.add(() => {
            if (!didReenter) {
                didReenter = true;
                reentrantCleanup = asset.disposeSceneAsync(scene);
            }
        });

        scene.dispose();
        const cleanup = asset.disposeSceneAsync(scene);
        await cleanup;

        expect(reentrantCleanup).toBe(cleanup);
        expect(cleanupCount).toBe(1);
    });

    it("caches aggregate terminal-scene cleanup failures", async () => {
        const firstCleanupError = new Error("first terminal cleanup failed");
        const secondCleanupError = new Error("second terminal cleanup failed");
        const engineResource = {
            name: "cleanup-failure-engine",
            create: () => new NullEngine(),
            dispose: (engine) => engine.dispose(),
        } satisfies Resource<NullEngine>;
        const firstFailingResource = {
            name: "first-failing-terminal-resource",
            create: () => ({}),
            dispose: () => {
                throw firstCleanupError;
            },
        } satisfies Resource<object>;
        const secondFailingResource = {
            name: "second-failing-terminal-resource",
            create: () => ({}),
            dispose: () => {
                throw secondCleanupError;
            },
        } satisfies Resource<object>;
        const definition = defineSourceBlock({
            type: "failing-cleanup-scene",
            output: BabylonSceneType,
            resources: { engine: engineResource, firstFailingResource, secondFailingResource },
            run: (_config, { engine }) => new Scene(engine),
        });
        const asset = new NodeAsset({ name: "failing-cleanup-scene", outputBlock: new Block(definition) });
        const scene = await asset.executeAsync();

        scene.dispose();
        const firstCleanup = asset.disposeSceneAsync(scene);
        const secondCleanup = asset.disposeSceneAsync(scene);
        const error = await firstCleanup.catch((caught: unknown) => caught);

        expect(firstCleanup).toBe(secondCleanup);
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([secondCleanupError, firstCleanupError]);
        expect(scene.isDisposed).toBe(true);
        await expect(secondCleanup).rejects.toBe(error);
        expect(asset.disposeSceneAsync(scene)).toBe(firstCleanup);
    });

    it("allows an in-flight owned scene to be cleaned after asset disposal", async () => {
        let releaseEngine: (() => void) | undefined;
        const engineReady = new Promise<void>((resolve) => {
            releaseEngine = resolve;
        });
        const engineResource = {
            name: "delayed-engine",
            create: async () => {
                await engineReady;
                return new NullEngine();
            },
            dispose: (engine) => engine.dispose(),
        } satisfies Resource<NullEngine>;
        const definition = defineSourceBlock({
            type: "delayed-scene",
            output: BabylonSceneType,
            resources: { engine: engineResource },
            run: (_config, { engine }) => new Scene(engine),
        });
        const asset = new NodeAsset({ name: "delayed-scene", outputBlock: new Block(definition) });

        const execution = asset.executeAsync();
        asset.dispose();
        await expect(asset.executeAsync()).rejects.toThrow();
        releaseEngine?.();

        const scene = await execution;
        expect(scene.isDisposed).toBe(false);

        scene.dispose();
        await asset.disposeSceneAsync(scene);
        expect(scene.isDisposed).toBe(true);
    });

    it("disposes acquired dependencies when resource creation fails", async () => {
        const disposedResources: string[] = [];
        const dependency = {
            name: "acquired-dependency",
            create: () => ({}),
            dispose: () => {
                disposedResources.push("acquired-dependency");
            },
        } satisfies Resource<object>;
        const failingResource = {
            name: "failing-resource",
            dependencies: { dependency },
            create: () => {
                throw new Error("resource creation failed");
            },
            dispose: () => {
                disposedResources.push("failing-resource");
            },
        } satisfies Resource<object, { readonly dependency: typeof dependency }>;
        const definition = defineBlock({
            type: "failing-resource-consumer",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: { failingResource },
            run: (input) => input,
        });
        const block = new Block(definition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "resource-creation-failure", outputBlock: block });

        await expect(nodeAsset.executeAsync()).rejects.toThrow();
        expect(disposedResources).toEqual(["acquired-dependency"]);
    });

    it("attempts every resource disposal when cleanup fails", async () => {
        const disposedResources: string[] = [];
        const firstResource = {
            name: "first-resource",
            create: () => ({}),
            dispose: () => {
                disposedResources.push("first-resource");
            },
        } satisfies Resource<object>;
        const secondResource = {
            name: "second-resource",
            create: () => ({}),
            dispose: () => {
                disposedResources.push("second-resource");
                throw new Error("resource cleanup failed");
            },
        } satisfies Resource<object>;
        const definition = defineBlock({
            type: "cleanup-failure-consumer",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: { firstResource, secondResource },
            run: (input) => input,
        });
        const block = new Block(definition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "resource-cleanup-failure", outputBlock: block });

        await expect(nodeAsset.executeAsync()).rejects.toThrow();
        expect(disposedResources).toHaveLength(2);
        expect(disposedResources).toEqual(expect.arrayContaining(["first-resource", "second-resource"]));
    });

    it("preserves execution and cleanup failures", async () => {
        const executionError = new Error("execution failed");
        const cleanupError = new Error("cleanup failed");
        const resource = {
            name: "failing-cleanup",
            create: () => ({}),
            dispose: () => {
                throw cleanupError;
            },
        } satisfies Resource<object>;
        const definition = defineBlock({
            type: "execution-and-cleanup-failure",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: { resource },
            run: () => {
                throw executionError;
            },
        });
        const block = new Block(definition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "execution-and-cleanup-failure", outputBlock: block });

        const error = await nodeAsset.executeAsync().catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([executionError, cleanupError]);
    });

    it("rejects cyclic resource dependencies", async () => {
        interface CyclicDependencies {
            readonly [name: string]: Resource<object, CyclicDependencies>;
        }

        const firstResource = {
            name: "first-cyclic-resource",
            dependencies: {} as CyclicDependencies,
            create: () => ({}),
            dispose: () => undefined,
        } satisfies Resource<object, CyclicDependencies>;
        const secondResource = {
            name: "second-cyclic-resource",
            dependencies: { firstResource },
            create: () => ({}),
            dispose: () => undefined,
        } satisfies Resource<object, { readonly firstResource: typeof firstResource }>;
        firstResource.dependencies = { secondResource } as CyclicDependencies;
        const definition = defineBlock({
            type: "cyclic-resource-consumer",
            input: NumberDefinition.input,
            output: NumberDefinition.output,
            resources: { firstResource },
            run: (input) => input,
        });
        const block = new Block(definition, { input: 1 });
        const nodeAsset = new NodeAsset({ name: "cyclic-resources", outputBlock: block });

        await expect(nodeAsset.executeAsync()).rejects.toThrow();
    });
});
