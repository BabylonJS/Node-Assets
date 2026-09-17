import type { UrlWithStringQuery } from "node:url";
import type XMLHttpRequest from "xhr2";

// Upstream: xhr2 0.2.1, _onHttpResponse/_parseUrl in lib/xhr2.js.
// Remove when xhr2 resolves each Location against the current request URL.
export function withRelativeHttpRedirects(Request: typeof XMLHttpRequest): typeof XMLHttpRequest {
    return class extends Request {
        protected override _parseUrl(url: string): UrlWithStringQuery {
            const parsed = super._parseUrl(url);
            this.nodejsSet({ baseUrl: parsed.href });
            return parsed;
        }
    };
}
