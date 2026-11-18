import { DownloaderExtension, ExtensionContext, ExtensionManifest, PostResult } from "./types";

export abstract class BaseExtension implements DownloaderExtension {
  abstract manifest: ExtensionManifest;

  abstract extract(url: string, context: ExtensionContext): Promise<PostResult>;

  protected getDefaultHeaders(): Record<string, string> {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
  }

  protected getCustomHeaders(url: string, context: ExtensionContext): Record<string, string> {
    return {};
  }

  protected parseNetscapeCookies(content: string): Record<string, string> {
    const lines = content.split("\n");
    const map: Record<string, string> = {};

    for (const line of lines) {
      if (line.startsWith("#") || !line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length >= 7) {
        map[parts[5]] = parts[6];
      }
    }
    return map;
  }

  /**
   * Universal HTTP request helper for extensions.
   * Injects cookies and default headers, then dispatches request through
   * the host-provided context.fetch (or fallback global fetch).
   *
   * Network infrastructure concerns (proxies, FlareSolverr, retries)
   * are handled transparently by the host application.
   */
  protected async request(
    url: string,
    context: ExtensionContext,
    options: RequestInit = {}
  ): Promise<Response> {
    const rawCookieContent =
      this.manifest.cookies.support && context.getCookie
        ? await context.getCookie()
        : null;

    if (this.manifest.cookies.required && !rawCookieContent) {
      throw new Error(`Extension [${this.manifest.id}] requires session cookies, but none are available or active.`);
    }

    let cookieString = "";
    if (rawCookieContent) {
      const cookiesMap = this.parseNetscapeCookies(rawCookieContent);
      cookieString = Object.entries(cookiesMap)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ")
        .replace(/[^\x20-\x7E]/g, ""); // Strip non-ASCII characters to prevent Headers.append errors
    }

    const headers: Record<string, string> = {
      ...this.getDefaultHeaders(),
      ...this.getCustomHeaders(url, context),
      ...((options.headers as Record<string, string>) || {}),
    };

    if (cookieString) {
      headers["Cookie"] = headers["Cookie"] ? `${headers["Cookie"]}; ${cookieString}` : cookieString;
    }

    const fetchFn = context.fetch || fetch;
    return fetchFn(url, {
      ...options,
      headers,
    });
  }
}
