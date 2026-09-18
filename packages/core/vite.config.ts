import { isBuiltin } from "node:module";
import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite";
import dts from "vite-plugin-dts";

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
                /^@babylonjs\//.test(id) ||
                /^@gltf-transform\//.test(id) ||
                /^babylonpress-ktx2-encoder(?:\/|$)/.test(id) ||
                /^gltf-validator$/.test(id) ||
                /^meshoptimizer$/.test(id) ||
                /^sharp$/.test(id),
        },
    },
    plugins: [
        forceBundledDracoWebAssemblyRuntime(),
        emptyNodeBuiltins(),
        dts({
            tsconfigPath: "./tsconfig.build.json",
            rollupTypes: true,
        }),
    ],
});

function forceBundledDracoWebAssemblyRuntime(): Plugin {
    const nodeRuntimeDetection = /"object"==typeof process&&"object"==typeof process\.versions&&"string"==typeof process\.versions\.node/g;
    return {
        name: "node-assets-force-bundled-draco-wasm-runtime",
        enforce: "pre",
        transform(code, id) {
            if (!id.includes("/draco3dgltf/") || !id.endsWith("_nodejs.js")) {
                return;
            }
            const transformed = code.replace(nodeRuntimeDetection, "false");
            if (transformed === code) {
                throw new Error(`Unable to replace the Draco runtime detection in "${id}".`);
            }
            return { code: transformed, map: null };
        },
    };
}

function emptyNodeBuiltins(): Plugin {
    return {
        name: "node-assets-empty-node-builtins",
        enforce: "pre",
        resolveId: (id) => (isBuiltin(id) ? EmptyNodeBuiltinModuleId : undefined),
        load: (id) => (id === EmptyNodeBuiltinModuleId ? "export default {};" : undefined),
    };
}
