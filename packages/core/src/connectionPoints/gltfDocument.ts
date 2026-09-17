import { Document } from "@gltf-transform/core";

import { defineConnectionPointType } from "./connectionPoint";

export const GltfDocumentType = /* @__PURE__ */ defineConnectionPointType<Document>("gltf-document", (value): value is Document => value instanceof Document);
