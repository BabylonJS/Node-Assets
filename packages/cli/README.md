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
node-assets pipeline <input> [operation...] <output> [--stats] [--benchmark]
```

| Element   | Supported values           |
| --------- | -------------------------- |
| Input     | `.gltf`, `.glb`            |
| Output    | `.glb`                     |
| Operation | `draco`, `meshopt`, `ktx2` |

Without specifying operations, the CLI reads the input and writes it back out as the target output format.

Run `node-assets --help` for command help or `node-assets --version` for the
installed version.

### Run reports

```sh
node-assets pipeline input.glb draco output.glb --stats --benchmark
```

Use either flag independently or both together. Reports appear after the output
file has been written successfully. Without these flags, no run report is printed.

| Flag          | Report |
| ------------- | ------ |
| `--stats`     | Total size before and after, in bytes, for the named input and output files. |
| `--benchmark` | Completion time, user and system CPU time, RSS, peak RSS, and heap used. |

Size statistics compare serialized file sizes, not decoded asset sizes. The input
size excludes external buffers and images referenced by a `.gltf` or `.glb` file.

Benchmark timing covers pipeline creation (including library loading), execution,
output writing, and disposal, but excludes argument parsing, input validation, and
report printing. CPU times are process-wide and may include worker threads. RSS
(resident set size) and heap used are process-wide snapshots at completion; peak
RSS is the process-lifetime high-water mark, not a per-pipeline memory delta.
Times are reported in milliseconds and memory in bytes.

## Develop locally

From the repository root:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```
