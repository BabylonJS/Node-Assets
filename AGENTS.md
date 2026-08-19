# AGENTS.md

Guidance for coding agents working in this repository.

## What this is

`@babylonjs/node-assets` is an experimental TypeScript library for reading many 3D source formats and producing web-ready formats. The package targets Node and browser environments and bundles all required converters and compressors.

## Getting started

Read [[CONTRIBUTING.md]] for setup and scripts.

## Tests

Tests live in `tests/` and run in Node via Vitest.

The library is intended to behave identically in Node and the browser. Tests use a single Node project. WebAssembly and worker loading differ between the runtimes for Draco, Meshopt, and KTX2. When the bundled converters and compressors are implemented, add browser coverage as a separate Playwright project rather than through Vitest's browser mode.

## Style

- Prettier and ESLint define formatting. Use `pnpm format` rather than manual formatting.
- Use functional, immutable patterns.
- Add comments only when clarification is needed. Add JSDoc only for public API.
- Use short, conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`, ...).

## Pull requests

- Keep changes scoped to the task.
- Add a test for any bug you fix and any behavior you add.
- Describe the change and its rationale. Link a related issue when one exists.
