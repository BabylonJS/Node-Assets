# List of Blocks

> **Uses** lists a block's implementation dependencies: libraries, functions, modules, and instances. These may include execution-scoped resources.

## Inputs

See [input locations and dependencies](usage.md#input-locations-and-dependencies)
for the shared Node filesystem contract and Babylon dependency limitations.

- `FbxInputBlock`
    - Input: `string` HTTP(S) or data URL, or a Node filesystem path/file URL, pointing to an FBX file.
    - Output: `Document`
    - Uses: Babylon FBX loader
    - Behavior: Uses the Babylon scene loader to load an FBX using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `GltfInputBlock`
    - Input: `string` URI accepted by the current `PlatformIO`, or a Node filesystem path/file URL, pointing to a glTF or GLB.
    - Output: `Document`
    - Behavior: Reads glTF or GLB into a `Document`, using glTF Transform's default extension handling.
- `ObjInputBlock`
    - Input: `string` HTTP(S) or data URL, or a Node filesystem path/file URL, pointing to an OBJ file.
    - Output: `Document`
    - Uses: Babylon OBJ loader
    - Behavior: Uses the Babylon scene loader to load an OBJ using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.
- `StlInputBlock`
    - Input: `string` HTTP(S) or data URL, or a Node filesystem path/file URL, pointing to an STL file.
    - Output: `Document`
    - Uses: Babylon STL loader
    - Behavior: Uses the Babylon scene loader to load an STL using NullEngine, exports it as a GLB, then reimports the bytes as a `Document`.

# Transforms

- `ValidateBlock`
    - Input: `Document`
    - Output: the same `Document`
    - Uses: `gltf-validator`; execution-scoped `PlatformIO`
    - Behavior: Validates the document, throwing on errors and logging other issues. Ignores `UNSUPPORTED_EXTENSION`.
- `EncodeKTX2Block`
    - Input: `Document`
    - Output: `Document` (but in future should be type that locks images and/or textures)
    - Uses: `RasterImageCodecResource`, `KTX2EncoderResource`, and `PlatformIOResource`
    - Behavior: Compresses compatible textures to KTX2, inferring encoding from material usage.
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
