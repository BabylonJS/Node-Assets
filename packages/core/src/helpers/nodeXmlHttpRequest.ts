import type * as FileSystem from "node:fs/promises";
import type * as NodeUrl from "node:url";
import type * as Xhr from "xhr2";

import { isNodeRuntime } from "./isNodeRuntime";
import { isFileLocation } from "./inputLocation";

export async function initializeNodeXmlHttpRequestAsync(): Promise<void> {
    if (!isNodeRuntime() || typeof globalThis.XMLHttpRequest !== "undefined") {
        return;
    }

    const xhrModuleName = "xhr2";
    const fileSystemModuleName = "node:fs/promises";
    const urlModuleName = "node:url";
    const [{ default: HttpRequest }, { readFile }, { pathToFileURL }] = await Promise.all([
        import(/* @vite-ignore */ xhrModuleName) as Promise<typeof Xhr>,
        import(/* @vite-ignore */ fileSystemModuleName) as Promise<typeof FileSystem>,
        import(/* @vite-ignore */ urlModuleName) as Promise<typeof NodeUrl>,
    ]);

    // xhr2 supplies HTTP(S); this adapter adds asynchronous, read-only filesystem requests.
    class NodeXmlHttpRequest extends HttpRequest {
        #file: URL | undefined;
        #controller: AbortController | undefined;
        #timeout: ReturnType<typeof setTimeout> | undefined;

        public override open(method: string, url: string, async = true, user?: string, password?: string): void {
            this.abort();
            this.#file = isFileLocation(url) ? (/^file:/i.test(url) ? new URL(url) : pathToFileURL(url)) : undefined;
            if (this.#file && (method.toUpperCase() !== "GET" || !async)) {
                throw new Error("Local asset requests require asynchronous GET.");
            }
            super.open(method, this.#file?.href ?? url, async, user, password);
        }

        public override send(body?: unknown): void {
            if (!this.#file) {
                super.send(body);
                return;
            }
            if (this.readyState !== HttpRequest.OPENED || this.#controller) {
                throw new Error("The file request is not ready to send.");
            }
            if (this.responseType !== "" && this.responseType !== "text" && this.responseType !== "arraybuffer") {
                throw new Error(`Unsupported local asset response type "${this.responseType}".`);
            }

            const controller = new AbortController();
            this.#controller = controller;
            this.response = null;
            this.responseText = null;
            this.responseURL = this.#file.href;
            if (this.timeout > 0) {
                this.#timeout = setTimeout(() => this.#cancel("timeout"), this.timeout);
            }
            this.dispatchEvent(new HttpRequest.ProgressEvent("loadstart"));
            void readFile(this.#file, { signal: controller.signal }).then(
                (data) => {
                    if (this.#controller !== controller) {
                        return;
                    }
                    this.status = 200;
                    this.statusText = "OK";
                    this.responseText = this.responseType === "arraybuffer" ? null : data.toString("utf8");
                    this.response = this.responseType === "arraybuffer" ? Uint8Array.from(data).buffer : this.responseText;
                    this.#finish("load");
                },
                (error: unknown) => {
                    if (this.#controller !== controller) {
                        return;
                    }
                    this.status = error instanceof Error && "code" in error && error.code === "ENOENT" ? 404 : 400;
                    this.statusText = error instanceof Error ? error.message : String(error);
                    this.#finish("error");
                }
            );
        }

        public override abort(): void {
            if (this.#controller) {
                this.#cancel("abort");
            } else {
                super.abort();
            }
        }

        #cancel(event: "abort" | "timeout"): void {
            this.#controller?.abort();
            this.status = 0;
            this.statusText = event;
            this.response = null;
            this.responseText = null;
            this.#finish(event);
        }

        #finish(event: string): void {
            clearTimeout(this.#timeout);
            this.#timeout = undefined;
            this.#controller = undefined;
            this.readyState = HttpRequest.DONE;
            this.dispatchEvent(new HttpRequest.ProgressEvent("readystatechange"));
            this.dispatchEvent(new HttpRequest.ProgressEvent(event));
            this.dispatchEvent(new HttpRequest.ProgressEvent("loadend"));
        }
    }

    // Another execution or the host may have installed a transport while imports were pending.
    if (typeof globalThis.XMLHttpRequest === "undefined") {
        Object.defineProperty(globalThis, "XMLHttpRequest", { configurable: true, writable: true, value: NodeXmlHttpRequest });
    }
}
