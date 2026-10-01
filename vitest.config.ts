import { defineConfig } from "vitest/config";

import { codecBuildPlugin } from "./packages/core/build/codecBuildPlugin";

// Tests use a single Node project. The library API is identical in Node and the
// browser. WebAssembly and worker loading differ between runtimes for Draco,
// Meshopt, and KTX2. Add browser coverage as a separate Playwright project when
// those codecs are implemented; do not use Vitest browser mode. Babylon.js and
// Babylon-Lite use this configuration.
export default defineConfig({
    plugins: [codecBuildPlugin()],
    test: {
        environment: "node",
        include: ["tests/**/*.test.ts"],
        passWithNoTests: true,
        reporters: process.env.CI ? ["default", "junit"] : ["default"],
        outputFile: {
            junit: "test-results/junit.xml",
        },
    },
});
