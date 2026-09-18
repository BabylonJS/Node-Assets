declare module "*?url&no-inline" {
    const url: string;
    export default url;
}

declare module "virtual:node-assets-msc-transcoder" {
    const createModule: (options: { readonly wasmBinary: ArrayBuffer }) => Promise<unknown>;
    export default createModule;
}

declare module "virtual:node-assets-basis-encoder-wasm-url" {
    const url: string;
    export default url;
}
