import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    build: {
        target: "node20",
        minify: false,
        sourcemap: true,
        lib: {
            entry: "src/cli.ts",
            formats: ["es"],
            fileName: () => "cli.js",
        },
        rollupOptions: {
            external: (id) => isBuiltin(id) || id === "@babylonjs/node-assets",
        },
    },
});
