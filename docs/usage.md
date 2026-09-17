# Command-line pipelines

The separate `@babylonjs/node-assets-cli` package provides the `node-assets` command:

```sh
node-assets pipeline input.gltf output.glb
node-assets pipeline input.glb ktx2 draco output.glb
```

The syntax is `node-assets pipeline <input file> [...blocks] <output file>`.
The first path selects the input block, the last selects the output block, and
the names between them select transform blocks in order.

| Argument | Supported values | Behavior |
| --- | --- | --- |
| Input extension | `.gltf`, `.glb` | Read a local glTF or GLB with `GltfInputBlock`. |
| Output extension | `.glb` | Write GLB with `GltfOutputBlock`. |
| Transform | `draco` | Apply `EncodeDracoBlock` with library defaults. |
| Transform | `meshopt` | Apply `EncodeMeshoptBlock` with library defaults. |
| Transform | `ktx2` | Apply `EncodeKTX2Block` with library defaults. |

Extensions are case-insensitive; block names are case-sensitive. Missing or
unsupported extensions are errors, including `.gltf` output. With no transforms,
the input connects directly to the output. This is a library read/write round
trip, not a byte-for-byte copy or a promise to retain input compression.

Every transform occurrence creates a separate block. Order and repetitions are
preserved, including pipelines containing both geometry encoders. The CLI does
not impose combination restrictions; any library failure is reported instead.
Custom blocks, prefab aliases, and per-block settings are not supported yet.

Paths are local filesystem paths relative to the caller's working directory.
The input must be a regular file; referenced glTF buffers and images are loaded
by the library. Quote paths containing spaces and use `--` before positional
arguments that begin with a hyphen.

The output's parent directory must exist. Existing destinations are never
overwritten, including when the input and output are the same file. There is no
`--force` flag. Pipeline failures do not create an output file.

`--help` / `-h` lists syntax, extensions, and blocks. Running without arguments
also shows help. `--version` / `-v` reports the CLI package version. These commands
do not run a pipeline. Success exits with status 0; invalid arguments, input,
pipeline, and output errors are reported to stderr and exit with status 1.

To use the CLI from this repository before installing a published package:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```

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
