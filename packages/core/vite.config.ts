import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

import { codecBuildPlugin } from "./build/codecBuildPlugin";

const EmptyNodeBuiltinModuleId = "\0node-assets-empty-node-builtin";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "./",
    build: {
        target: "es2022",
        minify: false,
        sourcemap: true,
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "index.js",
        },
        rollupOptions: {
            external: (id) =>
                (/^@babylonjs\//.test(id) && !/^@babylonjs\/ktx2decoder\/wasm\//.test(id)) ||
                /^@gltf-transform\//.test(id) ||
                /^babylonpress-ktx2-encoder(?:\/|$)/.test(id) ||
                /^gltf-validator$/.test(id) ||
                /^meshoptimizer$/.test(id) ||
                /^sharp$/.test(id),
        },
    },
    plugins: [
        codecBuildPlugin(),
        emptyNodeBuiltins(),
        dts({
            tsconfigPath: "./tsconfig.build.json",
            rollupTypes: true,
        }),
    ],
});

function emptyNodeBuiltins(): Plugin {
    return {
        name: "node-assets-empty-node-builtins",
        enforce: "pre",
        resolveId: (id) => (isBuiltin(id) ? EmptyNodeBuiltinModuleId : undefined),
        load: (id) => (id === EmptyNodeBuiltinModuleId ? "export default {};" : undefined),
    };
}
