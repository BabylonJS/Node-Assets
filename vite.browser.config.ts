import { isBuiltin } from "node:module";

import { defineConfig, type Plugin } from "vite";

const EmptyNodeBuiltinModuleId = "\0node-assets-empty-node-builtin";

export default defineConfig({
    base: "./",
    build: {
        target: "es2022",
        minify: false,
        emptyOutDir: false,
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "index.browser.js",
        },
        rollupOptions: {
            external: (id) => /^@babylonjs\//.test(id) || /^babylonpress-ktx2-encoder(?:\/|$)/.test(id) || /^meshoptimizer$/.test(id),
        },
    },
    plugins: [emptyNodeBuiltins()],
});

function emptyNodeBuiltins(): Plugin {
    return {
        name: "node-assets-empty-node-builtins",
        enforce: "pre",
        resolveId: (id) => (isBuiltin(id) ? EmptyNodeBuiltinModuleId : undefined),
        load: (id) => (id === EmptyNodeBuiltinModuleId ? "export default {};" : undefined),
    };
}
