import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin, ResolvedConfig } from "vite";

export const MscTranscoderModuleId = "virtual:node-assets-msc-transcoder";
const ResolvedMscTranscoderModuleId = `\0${MscTranscoderModuleId}`;
const BasisEncoderWasmUrlModuleId = "virtual:node-assets-basis-encoder-wasm-url";
const DracoNodeRuntimeDetection = /"object"==typeof process&&"object"==typeof process\.versions&&"string"==typeof process\.versions\.node/g;

export function codecBuildPlugin(): Plugin {
    let resolvePackage: ReturnType<ResolvedConfig["createResolver"]> | undefined;
    let isBuild = false;
    return {
        name: "node-assets-codecs",
        enforce: "pre",
        configResolved(config) {
            resolvePackage = config.createResolver();
            isBuild = config.command === "build";
        },
        async resolveId(id) {
            if (id === MscTranscoderModuleId) {
                return ResolvedMscTranscoderModuleId;
            }
            if (id === BasisEncoderWasmUrlModuleId) {
                // TODO: Remove this override when the encoder keeps its relative WASM URL valid after Vite pre-bundling.
                const encoderEntry = await resolvePackage?.("babylonpress-ktx2-encoder", fileURLToPath(import.meta.url));
                if (encoderEntry === undefined) {
                    throw new Error("Unable to resolve the KTX2 encoder package.");
                }
                return `${resolve(dirname(encoderEntry), "../basis/basis_encoder.wasm")}?url&no-inline`;
            }
        },
        async load(id) {
            if (id !== ResolvedMscTranscoderModuleId) {
                return;
            }
            // TODO: Remove this conversion when @babylonjs/ktx2decoder exports the MSC transcoder as an ES module.
            const path = createRequire(import.meta.url).resolve("@babylonjs/ktx2decoder/wasm/msc_basis_transcoder.js");
            const source = await readFile(path, "utf8");
            const umdWrapperOffset = source.indexOf("\nif (typeof exports");
            if (umdWrapperOffset === -1) {
                throw new Error("Unable to locate the MSC transcoder UMD wrapper.");
            }
            const nodeRuntimeDetection = /ENVIRONMENT_IS_NODE=typeof process==="object"&&typeof process\.versions==="object"&&typeof process\.versions\.node==="string"/;
            const esmSource = source.slice(0, umdWrapperOffset).replace(nodeRuntimeDetection, "ENVIRONMENT_IS_NODE=false");
            if (esmSource === source.slice(0, umdWrapperOffset)) {
                throw new Error("Unable to replace the MSC transcoder runtime detection.");
            }
            return `/*! @babylonjs/ktx2decoder MSC transcoder, Apache-2.0 */\n${esmSource}\nexport default MSC_TRANSCODER;\n`;
        },
        transform(code, id) {
            if (!isBuild || !id.includes("/draco3dgltf/") || !id.endsWith("_nodejs.js")) {
                return;
            }
            // TODO: Remove this rewrite when draco3dgltf provides a browser-safe conditional export.
            const transformed = code.replace(DracoNodeRuntimeDetection, "false");
            if (transformed === code) {
                throw new Error(`Unable to replace the Draco runtime detection in "${id}".`);
            }
            return { code: transformed, map: null };
        },
    };
}
