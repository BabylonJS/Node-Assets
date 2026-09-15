import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    base: "./",
    build: {
        target: "es2022",
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
                /^draco3dgltf$/.test(id) ||
                /^meshoptimizer$/.test(id) ||
                /^node:/.test(id) ||
                /^sharp$/.test(id),
        },
    },
    plugins: [
        dts({
            tsconfigPath: "./tsconfig.build.json",
            rollupTypes: true,
        }),
    ],
});
