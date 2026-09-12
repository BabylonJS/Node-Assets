# Blocks

A block is a single piece of functionality. They are broadly categorized as follows:

1. Inputs: data. User supplies the value; then, graph-managed data flows out.
2. Transforms: functions. Data is managed by graph in both directions, in and out.
3. Outputs: data. Graph-managed data in, user-facing data out.

Blocks have input and output ports. Some might also have additional, optional input ports.

# Block registry

# Inputs

Named by noun.

- `FbxInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an FBX file.
    - Output: output (BabylonScene)
    - Resources: Babylon FBX loader
    - Behavior: Uses the Babylon scene loader to load an FBX using NullEngine. The FBX loader implementation loads on demand.
- `GltfInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to a glTF or GLB.
    - Output: output (BabylonScene)
    - Resources: Babylon glTF loader
    - Behavior: Uses the Babylon scene loader to load a glTF using NullEngine. The glTF 2 loader and each built-in extension implementation load on demand.
- `ObjInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an OBJ file.
    - Output: output (BabylonScene)
    - Resources: Babylon OBJ loader
    - Behavior: Uses the Babylon scene loader to load an OBJ using NullEngine. The OBJ loader implementation loads on demand. For HTTP(S) OBJ URLs, referenced MTL files and supported relative textures are fetched automatically and embedded before loading. Data-URI OBJ inputs must be self-contained; relative MTL or texture references require an HTTP(S) base URL.
- `StlInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an STL file.
    - Output: output (BabylonScene)
    - Resources: Babylon STL loader
    - Behavior: Uses the Babylon scene loader to load an STL using NullEngine. The STL loader implementation loads on demand.
- `DracoEncoderBlock`
    - Input: none
    - Output: output (GltfMeshCompressionOptions)
    - Resources: Babylon default DracoEncoder, package-owned browser encoder assets, and a shared Node worker-thread pool
    - Behavior: Lazily prepares Babylon's default Draco encoder and provides `{ meshCompressionMethod: "Draco" }` as the per-export glTF mesh compression options that enable it. Browser builds load the emitted encoder wrapper and WebAssembly from the application's own origin. Node uses an auto-releasing worker pool sized to half the available processors, with a minimum of one and maximum of four workers. Caller-customized Babylon default configuration is left unchanged. Connect its output to `GltfOutputBlock`'s `geometryCompressionOptions` port.

Browser deployments must still permit blob workers and WebAssembly under their Content Security Policy, typically through `worker-src blob:` and `script-src 'wasm-unsafe-eval'` where the target browser requires them.

# Transforms

Named by verb.

- `CompressTexturesBlock`
    - Input: input (BabylonScene)
    - Output: output (BabylonScene)
    - Resources: `babylonpress-ktx2-encoder`
    - Behavior: Applies BasisU compression to supported 2D image-backed Babylon `Texture` instances used by built-in PBR materials and by StandardMaterial diffuse, ambient, opacity, reflection, emissive, specular, bump, lightmap, and refraction slots, resulting in .ktx2 images. Shared source images are encoded once per color/normal semantic and reused while retaining each texture's transforms, UV selection, sampling, and metadata. Cube, render-target, dynamic, procedural, and other non-image texture types are left unchanged. Output serialization remains limited to the texture slots supported by the selected output format.

# Outputs

Named by noun.

- `GltfOutputBlock`
    - Inputs: input (BabylonScene), geometryCompressionOptions (GltfMeshCompressionOptions, optional)
    - Output: `File` which is a GLB
    - Resources: Babylon glTF exporter
    - Behavior: Uses GLBExport to export the scene to GLB and passes through any supplied mesh compression options. If `geometryCompressionOptions` is not connected, the export remains uncompressed.

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

Same as before, but now add the `CompressTexturesBlock` transform and the `DracoEncoderBlock` input.

```ts
const source = new GltfInputBlock({ input: "https://assets.babylonjs.com/meshes/box.glb" });
const compressTextures = new CompressTexturesBlock();
const dracoEncoder = new DracoEncoderBlock();
const destination = new GltfOutputBlock();

source.output.connectTo(compressTextures.input);
compressTextures.output.connectTo(destination.input);
dracoEncoder.output.connectTo(destination.geometryCompressionOptions);

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

`GltfInputBlock` accepts a URL (HTTPS or data) pointing to either a glTF or GLB. You can supply a default value for this in the constructor, as shown above.

`GltfOutputBlock` produces a `File`, which is a GLB.

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

## Disposing terminal scenes

When `executeAsync` returns a Babylon.js `Scene` created with an engine owned by that execution, the scene and the execution's entire resource scope remain alive until you explicitly release them with `disposeSceneAsync`. Use `try`/`finally` so cleanup also runs when later work fails.

```ts
const source = new GltfInputBlock({
    input: "https://assets.babylonjs.com/meshes/box.glb",
});
const asset = new NodeAsset({
    name: "gltf-scene",
    outputBlock: source,
});

const scene = await asset.executeAsync();
try {
    scene.render();
} finally {
    await asset.disposeSceneAsync(scene);
}
```

The whole execution scope is retained because block resource definitions do not describe which dependencies escape through scene outputs. Multiple scenes using the execution-owned engine therefore remain valid until the terminal scene is released, then are disposed together with the engine and the rest of the scope.

`disposeSceneAsync` is safe to call more than once. It does nothing for unregistered scenes, including scenes backed by caller-owned engines. Calling `NodeAsset.dispose()` prevents new executions but does not release scenes returned by earlier or currently running executions; those scenes remain individually releasable afterward. Calling Babylon's synchronous `Scene.dispose()` does not replace `await asset.disposeSceneAsync(scene)` because execution resources may require asynchronous cleanup.

Executions that return `File`, numeric, or other non-scene values continue to clean up their resources before `executeAsync` resolves.

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

Each NodeAsset execution owns its resources. Non-scene executions clean them up before returning, while execution-owned terminal scenes retain their scope until `disposeSceneAsync`.

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
