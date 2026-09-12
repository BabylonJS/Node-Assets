import { DracoEncoder } from "@babylonjs/core/Meshes/Compression/dracoEncoder.js";

import { describe, expect, it, vi } from "vitest";

import { DracoEncoderBlock, NodeAsset } from "../../src/index";

describe("Draco browser configuration", () => {
    it("configures package-owned encoder assets only when compression is enabled", async () => {
        const originalConfiguration = DracoEncoder.DefaultConfiguration;
        vi.stubGlobal("window", {});

        try {
            await new NodeAsset({ name: "browser-draco-encoder", outputBlock: new DracoEncoderBlock() }).executeAsync();

            expect(DracoEncoder.DefaultConfiguration.wasmUrl).toContain("draco_encoder_wasm_wrapper");
            expect(DracoEncoder.DefaultConfiguration.wasmBinaryUrl).toContain("draco_encoder");
            expect(DracoEncoder.DefaultConfiguration.wasmUrl).not.toContain("cdn.babylonjs.com");
            expect(DracoEncoder.DefaultConfiguration.wasmBinaryUrl).not.toContain("cdn.babylonjs.com");
            expect(DracoEncoder.DefaultConfiguration.fallbackUrl).toBeUndefined();
            expect(DracoEncoder.DefaultConfiguration.wasmUrl).not.toMatch(/^file:/);
            expect(DracoEncoder.DefaultConfiguration.wasmBinaryUrl).not.toMatch(/^file:/);
        } finally {
            vi.unstubAllGlobals();
            DracoEncoder.ResetDefault(true);
            DracoEncoder.DefaultConfiguration = originalConfiguration;
        }
    });
});
