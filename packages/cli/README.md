# Node Assets CLI

`@babylonjs/node-assets-cli` builds and runs linear `@babylonjs/node-assets`
pipelines. The package installs the `node-assets` command.

## Usage

```sh
node-assets pipeline input.gltf output.glb
node-assets pipeline input.glb ktx2 draco output.glb
```

The command syntax is:

```text
node-assets pipeline <input file> [...blocks] <output file>
```

The input extension selects the input block. The output extension selects the
output block.

| Kind | Supported values |
| --- | --- |
| Input | `.gltf`, `.glb` |
| Output | `.glb` |
| Block | `draco`, `meshopt`, `ktx2` |

The CLI creates each named block and connects the pipeline from left to right.
It preserves repeated blocks and mixed encoders. Without a block name, the CLI
reads the input and writes it as GLB.

Paths are relative to the current working directory. The input must be a file,
and the output directory must exist. The CLI refuses to overwrite an existing
file.

Run `node-assets --help` for command help or `node-assets --version` for the
installed version.

## Develop locally

From the repository root:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```
