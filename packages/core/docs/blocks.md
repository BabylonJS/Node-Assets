# List of Blocks

> **Uses** lists a block's implementation dependencies: libraries, functions, modules, and instances. These may include execution-scoped resources.

## Inputs

- `FbxInputBlock`
    - Input: `string` which is a URL (HTTPS or data) that points to an FBX file.
    - Output: `Document`
    - Uses: Babylon FBX loader
    - Behavior: Uses the Babylon scene loader to load an FBX using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `GltfInputBlock`
    - Input: `string` URI accepted by the current `PlatformIO` that points to a glTF or GLB.
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
    - Uses: `encodeToKTX2` (`babylonpress-ktx2-encoder`); `sharp` (Node.js only)
    - Behavior: Compresses textures to KTX2 using encoder defaults, preserving color-space and normal-map semantics.
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
