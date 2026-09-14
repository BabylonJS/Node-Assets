import { defineConnectionPointType } from "./connectionPoint";

export const FileType = /* @__PURE__ */ defineConnectionPointType<File>("file", (value): value is File => value instanceof File);
