# Node Assets CLI

A command-line interface for building and running pipelines with `@babylonjs/node-assets`.

> **⚠️ Notice:** This package is experimental. API is subject to change and not intended for production use.

## Usage

### Pipelines

A pipeline is a sequence of operations applied to a 3D asset. The CLI allows you to define and run pipelines using the `node-assets pipeline` command.

```sh
node-assets pipeline input.gltf output.glb
node-assets pipeline input.glb ktx2 draco output.glb
node-assets pipeline model.fbx cull-unused quantize meshopt output.glb
```

The command syntax is:

```text
node-assets pipeline <input> [operation...] <output> [--force] [--stats] [--benchmark]
```

| Element   | Supported values                                                        |
| --------- | ----------------------------------------------------------------------- |
| Input     | `.gltf`, `.glb`, `.fbx`, `.obj`, `.stl`, `.usd`, `.usda`, `.usdc`, `.usdz` |
| Output    | `.glb`                                                                  |
| Operation | `draco`, `meshopt`, `ktx2`, `validate`, `quantize`, `cull-unused`, `strip-materials` |

USD inputs require Web Worker support (a global `Worker`). On Node versions that
offer it behind a flag, such as Node 26, enable it with:

```sh
NODE_OPTIONS=--experimental-web-worker node-assets pipeline model.usdz output.glb
```

Without specifying operations, the CLI reads the input and writes it back out as the target output format.

Run `node-assets --help` for command help or `node-assets --version` for the
installed version.

### Replacing output

By default, the CLI does not overwrite an existing output file. It stops before
running the pipeline and reports the error. To replace the file,
for example when you repeat a benchmark run, add `--force` (or `-f`):

```sh
node-assets pipeline input.glb draco output.glb --force --benchmark
```

The CLI replaces the output file only after the pipeline succeeds, so a failed
run leaves the existing file unchanged. If the output is a symbolic link, the CLI
replaces the link, not the file it points to. The CLI never replaces the input
file, even with `--force`. It does not protect the files that a `.gltf` input
references, such as external buffers and images, so do not name one of them as
the output.

### Run reports

```sh
node-assets pipeline input.glb draco output.glb --stats --benchmark
```

Use either flag independently or both together. Reports appear after the output
file has been written successfully. Without these flags, no run report is printed.

| Flag          | Report |
| ------------- | ------ |
| `--stats`     | Total size before and after for the named input and output files. |
| `--benchmark` | Completion time, user and system CPU time, RSS, peak RSS, and heap used. |

Size statistics compare serialized file sizes, not decoded asset sizes. The input
size excludes external buffers and images referenced by a `.gltf` or `.glb` file.

Benchmark timing covers pipeline creation (including library loading), execution,
output writing, and disposal, but excludes argument parsing, input and output file
checks, and report printing. CPU times are process-wide and may include worker
threads. RSS (resident set size) and heap used are process-wide snapshots at
completion; peak RSS is the process-lifetime high-water mark, not a per-pipeline
memory delta.

The total size before selects a shared unit for both size totals, using
1024-based units (B, KiB, MiB, GiB, TiB, PiB). Memory values scale independently.
Bytes remain whole numbers; larger units use two decimal places. For example,
2,088 bytes before and 776 bytes after display as `2.04 KiB` and `0.76 KiB`.

Completion time selects a shared unit for all timing rows: milliseconds (`ms`),
seconds (`s`), minutes (`min`), or hours (`h`), with two decimal places. For
example, a 2,538.93 ms run displays as `2.54 s`, and 115.06 ms of system CPU time
displays as `0.12 s`. Size and time unit selection advances to the next unit when
rounding reaches its boundary. The selected unit is kept for the other rows,
even when their values would otherwise use a different unit.

## Develop locally

From the repository root:

```sh
pnpm install
pnpm build
pnpm cli pipeline input.gltf ktx2 draco output.glb
```
