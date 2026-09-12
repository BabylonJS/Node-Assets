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
            // Runtime modules stay external; package-owned browser Draco assets are emitted.
            external: (id) => !isBundledDracoAsset(id) && (/^@babylonjs\//.test(id) || /^babylonpress-ktx2-encoder$/.test(id) || /^node:/.test(id) || /^sharp$/.test(id)),
        },
    },
    plugins: [
        dts({
            tsconfigPath: "./tsconfig.build.json",
            rollupTypes: true,
        }),
    ],
});

function isBundledDracoAsset(id: string): boolean {
    return id === "@babylonjs/core/assets/Draco/draco_encoder.wasm?url&no-inline" || id === "@babylonjs/core/assets/Draco/draco_encoder_wasm_wrapper.js?url&no-inline";
}
