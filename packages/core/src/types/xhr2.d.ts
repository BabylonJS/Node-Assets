declare module "xhr2" {
    import type { UrlWithStringQuery } from "node:url";

    export default class XMLHttpRequest {
        static readonly OPENED: 1;
        static readonly DONE: 4;
        static readonly ProgressEvent: new (type: string) => { readonly type: string };

        readyState: number;
        response: unknown;
        responseText: string | null;
        responseType: string;
        responseURL: string;
        status: number;
        statusText: string;
        timeout: number;

        open(method: string, url: string, async?: boolean, user?: string, password?: string): void;
        send(body?: unknown): void;
        abort(): void;
        dispatchEvent(event: { readonly type: string }): void;
        nodejsSet(options: { readonly baseUrl: string }): void;
        protected _parseUrl(url: string): UrlWithStringQuery;
    }
}
