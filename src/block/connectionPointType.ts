import type { Scene as BabylonScene } from "@babylonjs/core/scene.js";
import type { IExportOptions } from "@babylonjs/serializers/glTF/2.0/glTFSerializer.js";

declare const connectionPointData: unique symbol;

export interface ConnectionPointType<Payload> {
    readonly id: string;
    readonly [connectionPointData]: Payload;
    is(value: unknown): value is Payload;
}

export type ConnectionPointValue<C extends ConnectionPointType<unknown>> = C extends ConnectionPointType<infer TData> ? TData : never;

export function defineConnectionPointType<P>(id: string, isData: (value: unknown) => value is P): ConnectionPointType<P> {
    return Object.freeze({ id, is: isData }) as ConnectionPointType<P>;
}

// Definitions

export const UrlType = /* @__PURE__ */ defineConnectionPointType<string>("url", (value): value is string => typeof value === "string");

export const FileType = /* @__PURE__ */ defineConnectionPointType<File>("file", (value): value is File => value instanceof File);

/** Per-export glTF mesh compression settings supplied by an opt-in compressor block. */
export type GltfMeshCompressionOptions = Required<Pick<IExportOptions, "meshCompressionMethod">>;

const gltfMeshCompressionOptions = /* @__PURE__ */ Symbol("gltf-mesh-compression-options");

export function createGltfMeshCompressionOptions(options: GltfMeshCompressionOptions): GltfMeshCompressionOptions {
    return Object.freeze(Object.defineProperty({ ...options }, gltfMeshCompressionOptions, { value: true }));
}

export const GltfMeshCompressionOptionsType = /* @__PURE__ */ defineConnectionPointType<GltfMeshCompressionOptions>(
    "gltf-mesh-compression-options",
    (value): value is GltfMeshCompressionOptions => typeof value === "object" && value !== null && gltfMeshCompressionOptions in value
);

export const BabylonSceneType = /* @__PURE__ */ defineConnectionPointType<BabylonScene>(
    "babylon-scene",
    (value): value is BabylonScene =>
        typeof value === "object" && value !== null && "getEngine" in value && typeof value.getEngine === "function" && "dispose" in value && typeof value.dispose === "function"
);
