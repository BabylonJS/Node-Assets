# Graph Terminology

Below is a rough translation guide for common graph terminology to Babylon node editor terminology.

A graph is a **NodeAsset**.
Nodes are referred to as **blocks** in code contexts and **nodes** in UI contexts.
Sink nodes, or terminal nodes, are **output blocks**.
Edges are **connections**.
End points of an edge are **connection points** in code contexts and **ports** in UI contexts.
The payload carried along an edge is **runtime data**.
The type of payload accepted by an end points is defined by its **connection point type**.
Edges can only be drawn between compatible **connection point types**.
Inbound end points are block **inputs**.
Outbound end points are block **outputs**.

# Connection Point Types

Connection points types, in general, come in two forms.

- File: for format- or byte-level operations. Examples: platform I/O
- Content: for content-level operations. Examples: removing vertices, updating texture pixels

## Content

- `Babylon` (future)
    - Runtime data: `Scene` (@babylonjs/core)
- `glTF`
    - Runtime data: `Document` (@gltf-transform/core)

Runtime data is passed by reference.

## File

(Future)

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

> Before diving into the block registry, a note on the resources listed: blocks using a `Document` connection point type are assumed to be have a `Document` (@gltf-transform/core) resource. Only additional resources are named below.

## Inputs

- `FbxInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an FBX file.
    - Output: `Document`
    - Resources: Babylon FBX loader
    - Behavior: Uses the Babylon scene loader to load an FBX using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `GltfInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to a glTF or GLB.
    - Output: `Document`
    - Behavior: Self-explanatory, I hope.
- `ObjInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an OBJ file.
    - Output: `Document`
    - Resources: Babylon OBJ loader
    - Behavior: Uses the Babylon scene loader to load an OBJ using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `StlInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an STL file.
    - Output: `Document`
    - Resources: Babylon STL loader
    - Behavior: Uses the Babylon scene loader to load an STL using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.

# Transforms

- `EncodeKTX2Block`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks images and/or textures)
    - Resources: `ktx2` (`babylonpress-ktx2-encoder/gltf-transform`); `sharp` (Node.js only)
    - Behavior: Compresses textures to KTX2 using `ktx2`, loading and preparing the encoder internally.
- `EncodeDracoBlock`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks geometry)
    - Resources: initialized `EncoderModule` (`draco3dgltf`)
    - Behavior: Uses glTF Transform's Draco compression behavior, loading and initializing the encoder internally.
- `EncodeMeshoptBlock`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks geometry)
    - Resources: `MeshoptEncoder` (`meshoptimizer`)
    - Behavior: Uses glTF Transform's Meshopt compression behavior, loading and preparing the encoder internally.

# Outputs

- `GltfOutputBlock`
    - Inputs: `Document`
    - Output: `File` which is a GLB
    - Behavior: Create GLB bytes.
