# Node Assets CLI

An experimental command-line interface to `@babylonjs/node-assets`.
Package name: `@babylonjs/node-assets-cli`. Executable name: `node-assets`.

## Usage

```sh
node-assets pipeline input.gltf output.glb
node-assets pipeline input.glb ktx2 draco output.glb
node-assets --help
```

The first path selects the input block (`.gltf` or `.glb`); the last selects the
output block (`.glb`). Extensions are case-insensitive.

Optional `draco`, `meshopt`, and `ktx2` blocks use library defaults and run in the
given order. Repeated blocks and mixed encoders are passed through to the
library, including any errors. Without transforms, the CLI performs a library
read/write round trip, not a byte-for-byte copy.

Paths are local and relative to your working directory. Quote paths with spaces;
use `--` before positionals that start with a hyphen. The input must be a regular
file, the destination's parent must exist, and existing files are never
overwritten. There is no `--force`.

`--help` / `-h` and no arguments show help. `--version` / `-v` prints the CLI
version. Success exits with status 0; errors go to stderr with status 1.

## Working in this repository

Run these commands from the repository root:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```

This workflow does not require a published CLI release. See the
[usage guide](https://github.com/BabylonJS/Node-Assets/blob/main/docs/usage.md)
for the complete contract.

## License

[Apache-2.0](LICENSE)
