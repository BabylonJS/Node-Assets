# Example: Hello, pipeline!

Connect a `GltfInputBlock` to a `GltfOutputBlock`, then execute the resulting `NodeAsset`.

```ts
const source = new GltfInputBlock({ input: "https://assets.babylonjs.com/meshes/box.glb" });
const destination = new GltfOutputBlock();

source.output.connectTo(destination.input);

const asset = new NodeAsset({
    name: "gltf-roundtrip",
    outputBlock: destination,
});

const result = await asset.executeAsync();
```

# Example: Validating a document

Insert a `ValidateBlock` wherever the current document should be checked by the
Khronos glTF Validator, or use it as the output block to return the validated
`Document`.

```ts
const source = new GltfInputBlock({ input: "box%20(1).glb" });
const validate = new ValidateBlock({ uri: "box%20(1).glb" });
const destination = new GltfOutputBlock();

source.output.connectTo(validate.input);
validate.output.connectTo(destination.input);

const asset = new NodeAsset({ name: "validated-gltf", outputBlock: destination });
const result = await asset.executeAsync();
```

Validation checks a serialized copy of the current document, including its
buffers and images, rather than the original source file. It returns the same
`Document` reference on success. The optional `uri` is a display label, not a file
to load; it defaults to `scene.glb` because documents do not retain source paths.

If there are no errors, the block prints a check mark followed by `<uri> is valid`
using `console.log`. Diagnostics are grouped by severity, code, and message, with
each location on an indented `at` line. Errors are labeled `[Error]`, warnings and
informational issues are labeled `[Warning]`, and hints are labeled `[Hint]`.
Errors come first, then warnings, informational issues, and hints. All reported
diagnostics are logged, even when validation fails. Any validation error rejects
the execution, preventing downstream blocks from running.

`UNSUPPORTED_EXTENSION` issues are ignored. Other diagnostics are not truncated,
so earlier warnings cannot hide a later error.

The CLI supports the same block:

```sh
node-assets pipeline input.glb validate output.glb
```

# Example: CLI run reports

```sh
node-assets pipeline input.glb draco output.glb --stats --benchmark
```

Both flags are optional and can be used independently. `--stats` reports the total
size before and after, comparing the named input file with the written
output file. External buffers and images referenced by a glTF input are not
included in the input file size.

`--benchmark` reports elapsed time and CPU time for pipeline creation, execution,
output writing, and disposal. It also reports process RSS and heap usage at
completion, plus peak RSS over the process lifetime. Reports are printed only
after a successful run. The total size before selects the unit for both size
totals, using 1024-based units (B, KiB, MiB, GiB, TiB, PiB). Completion time selects
the unit for all timing rows (ms, s, min, h). Memory values scale independently.
Times and sizes above bytes use two decimal places; bytes remain whole numbers.
Unit selection advances to the next unit when rounding reaches its boundary.
See the [CLI guide](../../cli/README.md) for command syntax.

# Example: Compressing GLB

Same as before, but now add KTX2 texture encoding and Draco geometry encoding.

```ts
const source = new GltfInputBlock({ input: "https://assets.babylonjs.com/meshes/box.glb" });
const encodeTextures = new EncodeKTX2Block();
const encodeGeometry = new EncodeDracoBlock();
const destination = new GltfOutputBlock();

source.output.connectTo(encodeTextures.input);
encodeTextures.output.connectTo(encodeGeometry.input);
encodeGeometry.output.connectTo(destination.input);

const asset = new NodeAsset({
    name: "gltf-roundtrip",
    outputBlock: destination,
});

const result = await asset.executeAsync();
```

# Creating blocks

```ts
const source = new GltfInputBlock({
    input: "box.glb",
});
const destination = new GltfOutputBlock();
```

# Connecting blocks

```typescript
source.output.connectTo(destination.input);
// Or
destination.input.connectTo(source.output);
```

Only ports with compatible types are able to be connected. This is enforced at author time with type-checking, then also at runtime.

# Disconnecting blocks

```typescript
source.output.disconnectFrom(destination.input);
// Or
destination.input.disconnectFrom(source.output);
```

# Creating a NodeAsset

## Setting output block

A NodeAsset's contract is defined by its output block. Whatever the output type of the output block it is assigned, that is what executeAsync will return. E.g., the return type of `executeAsync` on a NodeAsset whose output block is `GltfOutputBlock` will be a `File`.

Pass it in at construction time:

```ts
const asset = new NodeAsset({
    name: "gltf-roundtrip",
    outputBlock: destination,
});
```

# Setting values of input blocks

### Method 1. Using default values

If an `input` parameter is supplied in the constructor, it will be used as the default value for the input block. Executing the graph will use these default values.

```typescript
const source = new GltfInputBlock({ input: "box.glb" });

...

const result = await asset.executeAsync();
```

### Method 2. Using execution context

You can also supply input values through a `NodeAssetContext`. These values are used per-execution.

```ts
const source = new GltfInputBlock();

...

const context = new NodeAssetContext(asset);
context.setInput(source, "box.glb");

const result = await asset.executeAsync(context);
```

A context value overrides the input block's default value

```typescript
const source = new GltfInputBlock({ input: "pyramid.glb" });

...

const context = new NodeAssetContext(asset);
context.setInput(source, "box.glb");

const result1 = await asset.executeAsync(); // Will use "pyramid.glb"
const result2 = await asset.executeAsync(context); // Will use "box.glb"
```

Internally, `executeAsync` first reaches for the context values; if none given, then it uses the block-assigned default values. And if a block has no default value, execution will throw.

# Running against different inputs

Use one context per set of inputs.

```ts
...

const first = new NodeAssetContext(asset);
first.setInput(source, "https://assets.babylonjs.com/meshes/box.glb");

const second = new NodeAssetContext(asset);
second.setInput(source, "https://assets.babylonjs.com/meshes/BoomBox/BoomBox.gltf");
```

## Method 1: Sequential

Execute using each context:

```ts
const firstResult = await asset.executeAsync(first);
const secondResult = await asset.executeAsync(second);
```

Each NodeAsset execution owns and cleans up its resources.

## Method 2: Batched

**Status: Not planned**

To execute in batch, which can help reuse resources, executeAsync accepts an array of contexts.

```ts
const results = await asset.executeAsync([first, second]);
```

# Sharing resources

**Status: Deferred**

Use a `NodeAssetCoordinator` so that graphs can share expensive resources.

```ts
...

const coordinator = new NodeAssetCoordinator();

// TODO: This? Or inject coordinator?
const asset1 = coordinator.createNodeAsset({
    name: "graph1",
    outputBlock: destination1,
    coordinator
});

const asset2 = coordinator.createNodeAsset({
    name: "graph2",
    outputBlock: destination2,
    coordinator
});

const firstResult = await coordinator.executeAsync(asset1);
const secondResult = await coordinator.executeAsync(asset2);

await coordinator.dispose();
```

The coordinator must:

- create required resources lazily;
- reuse a resource across its executions;
- keep context values isolated;
- wait for required resources before execution; and
- dispose its resources.

## Run same graph, different contexts, in batch

**Status: Deferred**

Pass contexts as an array.

```ts
const results = await coordinator.executeAsync(asset, [first, second]);
```

The coordinator must run the contexts concurrently and return one result for each context.
