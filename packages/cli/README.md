# Node Assets CLI

A command-line interface for building and running pipelines with `@babylonjs/node-assets`.

> **⚠️ Notice:** This package is experimental. API is subject to change and not intended for production use.

## Usage

### Pipelines

A pipeline is a sequence of operations applied to a 3D asset. The CLI allows you to define and run pipelines using the `node-assets pipeline` command.

```sh
node-assets pipeline input.gltf output.glb
node-assets pipeline input.glb ktx2 draco output.glb
```

The command syntax is:

```text
node-assets pipeline <input> [operation...] <output>
```

| Element   | Supported values           |
| --------- | -------------------------- |
| Input     | `.gltf`, `.glb`            |
| Output    | `.glb`                     |
| Operation | `draco`, `meshopt`, `ktx2` |

Without specifying operations, the CLI reads the input and writes it back out as the target output format.

Run `node-assets --help` for command help or `node-assets --version` for the
installed version.

## Develop locally

From the repository root:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```
