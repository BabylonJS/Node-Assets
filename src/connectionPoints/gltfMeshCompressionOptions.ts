import type { IExportOptions } from "@babylonjs/serializers/glTF/2.0/glTFSerializer.js";

import { defineConnectionPointType } from "./connectionPoint";

export type GltfMeshCompressionOptions = Required<Pick<IExportOptions, "meshCompressionMethod">>;

const gltfMeshCompressionOptions = /* @__PURE__ */ Symbol("gltf-mesh-compression-options");

export function createGltfMeshCompressionOptions(options: GltfMeshCompressionOptions): GltfMeshCompressionOptions {
    return Object.freeze(Object.defineProperty({ ...options }, gltfMeshCompressionOptions, { value: true }));
}

export const GltfMeshCompressionOptionsType = /* @__PURE__ */ defineConnectionPointType<GltfMeshCompressionOptions>(
    "gltf-mesh-compression-options",
    (value): value is GltfMeshCompressionOptions => typeof value === "object" && value !== null && gltfMeshCompressionOptions in value
);
