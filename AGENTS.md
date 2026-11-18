# Guidelines for AI Agents & Contributors (mediadl-extensions)

This repository contains official media extraction extensions for **MediaDL**.

---

## 🔒 Security & Sandbox Rules (Priority 1)

1. **NO `process.env` ACCESS (STRICT)**:
   - Extensions **must never** read or depend on `process.env`.
   - Extensions execute within sandboxed runtimes on the host application. Attempting to access `process.env` is a security violation and will fail at runtime.

2. **Network Inversion of Control**:
   - Never implement platform-specific bypasses for Cloudflare (FlareSolverr), proxies, or captcha solvers directly inside an extension.
   - All network calls must pass through `this.request(url, context, options)` which dispatches to `context.fetch`.
   - The host application transparently provides network defenses (proxies, FlareSolverr, cookie injection, and rate limiting).

3. **Strict Import Boundary**:
   - Extensions must **only** import from:
     - `../../core/types`
     - `../../core/base`
     - local files within their own extension folder (`./manifest`, `./helpers`, etc.)
   - **Never** import external Node.js filesystem modules (`fs`, `child_process`, `os`, `net`).
   - Standard Web APIs (`fetch`, `URL`, `URLSearchParams`, `Headers`, `Response`, `atob`, `btoa`, `crypto`, `Buffer`) are permitted.

---

## 🧩 Extension Architecture Contract

Every extension lives in `src/extensions/<extension-id>/`. Its two main implementation files are:

### 1. `manifest.ts`

Defines metadata, URL regex matchers, cookie configuration, and anti-hotlink domain rules.

```typescript
import { ExtensionManifest } from "../../core/types";

export const myPlatformManifest: ExtensionManifest = {
  id: "myplatform",
  name: "MyPlatform",
  version: "1.0.0",
  description: "Media extractor for MyPlatform",
  urlPatterns: [
    /^https?:\/\/(?:www\.)?myplatform\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/i,
  ],
  cookies: {
    support: true,
    required: false,
    description: "Session cookies for high-resolution media",
  },
  allowedImageDomains: ["myplatform.com", "cdn.myplatform.com"],
  imageReferer: "https://www.myplatform.com/",
};
```

### 2. `index.ts`

Extends `BaseExtension` and implements `extract(url, context)`:

```typescript
import { ExtensionContext, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { myPlatformManifest } from "./manifest";

export class MyPlatformExtension extends BaseExtension {
  manifest = myPlatformManifest;

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const res = await this.request(url, context);
    // Parse HTML or JSON API ...
    return {
      id: "unique-post-id",
      platform: this.manifest.name,
      author: {
        username: "creator",
        avatar: "https://...",
        verified: false,
      },
      caption: "Post title or caption",
      mediaType: "single_video",
      items: [
        {
          id: "m1",
          type: "video",
          url: "https://media.myplatform.com/video.mp4",
          thumbnail: "https://media.myplatform.com/thumb.jpg",
        },
      ],
      timestamp: new Date().toISOString(),
    };
  }
}

export const myPlatformExtension = new MyPlatformExtension();
export default myPlatformExtension;
```

---

## 🧪 Verification & Build Steps

Before submitting changes or PRs, run:

```bash
# 1. Test your extension logic against a live URL (auto-detect extension)
pnpm test -- "https://www.example.com/post/abc123"

# 1b. Test by explicitly setting extension id
pnpm test -- myplatform "https://www.example.com/post/abc123"

# 1c. Test with inline cookies
pnpm test -- myplatform "https://www.example.com/post/abc123" --cookie="sessionid=xyz; user_id=123"

# 1d. Test with cookie file
pnpm test -- myplatform "https://www.example.com/post/abc123" --cookie-file="cookies.txt"

# 1e. Test with FlareSolverr
pnpm test -- myplatform "https://www.example.com/post/abc123" --flaresolverr="http://localhost:8191"

# 2. Type check
pnpm run type-check

# 3. Build bundle
pnpm run build
```

Verify that:

1. `pnpm test -- <url>` successfully extracts media items and returns clean `PostResult` JSON.
2. Cookie flow works using both `--cookie` and `--cookie-file` when required by the platform.
3. `--flaresolverr` test works for Cloudflare-protected targets when needed.
4. `pnpm run type-check` exits with 0 errors.
5. `pnpm run build` bundles your extension into `dist/<id>.js` and registers it in `dist/index.json`.
