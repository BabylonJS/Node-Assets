# Graph Terminology

Below is a rough translation guide for common graph terminology to Babylon node editor terminology.

A graph is a **NodeAsset**.
Nodes are referred to as **blocks** in code contexts and **nodes** in UI contexts.
Sink nodes, or terminal nodes, are **output blocks**.
Edges are **connections**.
End points of an edge are **connection points** in code contexts and **ports** in UI contexts.
The payload carried along an edge is **runtime data**: what a block processes.
The type of payload accepted by an end points is defined by its **connection point type**.
Edges can only be drawn between compatible **connection point types**.
Inbound end points are block **inputs**.
Outbound end points are block **outputs**.

# Connection Point Types

Connection points types, in general, come in two forms.

- File: for format- or byte-level operations. Examples: platform I/O (future)
- Content: for content-level operations. Examples: removing vertices, updating texture pixels

## Content

- `Babylon` (future)
    - Runtime data: `Scene` (@babylonjs/core)
- `glTF`
    - Runtime data: `Document` (@gltf-transform/core)

Runtime data is passed by reference.

## File

(Future)

# Resources

Resources are reusable values owned by a pipeline execution's resource scope, such as a shared `PlatformIO` instance. They are created on demand and shared by blocks within that execution. Blocks borrow resources; the scope retains them until execution completes or fails, then performs any required cleanup and releases its references.

Worker-backed encoding is future work.

# Blocks

Blocks are broadly categorized as follows.

1. Inputs: data. User supplies a value; then, graph-managed data flows out.
2. Mutators: functions. Data is managed by graph in both directions, in and out.
3. Outputs: data. Graph-managed data in, user-facing data out.

Some other categories:

- Files
- Selectors
- Transforms: N -> N
- Transcoders: N -> U

Blocks have input and output connection points. Some might also have additional, optional input connection points.

> **Uses** lists a block's implementation dependencies: libraries, functions, modules, and instances. These may include execution-scoped resources.

## Inputs

- `FbxInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an FBX file.
    - Output: `Document`
    - Uses: Babylon FBX loader
    - Behavior: Uses the Babylon scene loader to load an FBX using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `GltfInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to a glTF or GLB.
    - Output: `Document`
    - Behavior: Reads glTF or GLB into a `Document`, using glTF Transform's default extension handling.
- `ObjInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an OBJ file.
    - Output: `Document`
    - Uses: Babylon OBJ loader
    - Behavior: Uses the Babylon scene loader to load an OBJ using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `StlInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an STL file.
    - Output: `Document`
    - Uses: Babylon STL loader
    - Behavior: Uses the Babylon scene loader to load an STL using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.

# Transforms

- `EncodeKTX2Block`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks images and/or textures)
    - Uses: `ktx2` (`babylonpress-ktx2-encoder/gltf-transform`); `sharp` (Node.js only)
    - Behavior: Compresses textures to KTX2 using `ktx2` defaults, preserving color-space and normal-map semantics.
- `EncodeDracoBlock`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks geometry)
    - Uses: initialized `EncoderModule` (`draco3dgltf`)
    - Behavior: Uses glTF Transform's Draco compression behavior with library-default tuning.
- `EncodeMeshoptBlock`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks geometry)
    - Uses: `MeshoptEncoder` (`meshoptimizer`)
    - Behavior: Uses glTF Transform's Meshopt compression behavior with library-default tuning.

# Outputs

- `GltfOutputBlock`
    - Inputs: `Document`
    - Output: `File` which is a GLB
    - Behavior: Create GLB bytes.
