import { defineConnectionPointType } from "./connectionPoint";

export const UrlType = /* @__PURE__ */ defineConnectionPointType<string>("url", (value): value is string => typeof value === "string");
