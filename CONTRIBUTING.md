# Contributing

Because this package is still early in development, please open a discussion on the [Babylon.js forum](https://forum.babylonjs.com/t/node-assets-requesting-feedback-discussion/63877) about your feature request before starting any work.

## Prerequisites

This repo uses [pnpm](https://pnpm.io/). The required Node and pnpm versions are declared in
`package.json` (`engines` and `packageManager`).

## Getting Started

```bash
pnpm install
pnpm build
```

The library remains at the repository root; `packages/cli` is a separate pnpm
workspace package that depends on it. Build both packages before running the
local CLI:

```sh
pnpm cli pipeline input.gltf ktx2 draco output.glb
pnpm cli --help
```

## Scripts

```sh
pnpm lint          # ESLint, Prettier, and typecheck
pnpm lint:fix      # ESLint autofix
pnpm format        # Write Prettier formatting
pnpm test          # Run Vitest
pnpm test:watch    # Run Vitest in watch mode
pnpm build         # Build the library, then the CLI
pnpm build:library # Build only the library into dist/
pnpm cli           # Run the built CLI (append pipeline arguments)
pnpm typedocs      # Generate the TypeDoc API reference
```

The shared lint, format, and typecheck commands cover both packages. CLI tests
live in `tests/e2e/cli.test.ts` and build isolated package fixtures:

```sh
pnpm test tests/e2e/cli.test.ts
```

Make sure you've run `pnpm lint`, `pnpm test`, and `pnpm build` before opening a pull request.
