import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
    build: {
        target: "es2022",
        sourcemap: true,
        lib: {
            entry: "src/index.ts",
            formats: ["es"],
            fileName: () => "index.js",
        },
        rollupOptions: {
            // Babylon packages are externalized and are not bundled.
            external: [/^@babylonjs\//, /^node:/],
        },
    },
    plugins: [
        dts({
            tsconfigPath: "./tsconfig.build.json",
            rollupTypes: true,
        }),
    ],
});
