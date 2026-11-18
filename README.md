# MediaDL Official Extensions Repository

Official extensions repository for **MediaDL**.

Each platform scraper here is an independent, self-contained plugin compiled into a JavaScript bundle and published to an `index.json` catalog.

---

## 📦 Repository Index URL

After deploying to GitHub Pages, the repository URL is:

```bash
https://raw.githubusercontent.com/fiand1996/mediadl-extensions/repo/index.json
```

This URL can be added directly into your MediaDL Admin Dashboard under **Extensions > Marketplace**.

---

## 🛠️ Developing a New Extension

1. **Create an extension folder** under `src/extensions/<platform-id>`. For this guide, use `my-extension`:

   ```
   src/extensions/my-extension/
   ├── manifest.ts
   └── index.ts
   ```

2. **Define `manifest.ts`**:

   ```typescript
   import { ExtensionManifest } from "../../core/types";

   export const myExtensionManifest: ExtensionManifest = {
     id: "my-extension",
     name: "My Extension",
     version: "1.0.0",
     description: "Example extension to explain MediaDL extraction flow.",
     urlPatterns: [
       /^https?:\/\/(?:www\.)?example\.com\/post\/([a-zA-Z0-9_-]+)/i,
     ],
     cookies: {
       support: false,
       required: false,
       description: "Enable if your platform needs authenticated access.",
     },
     allowedImageDomains: ["example.com", "cdn.example.com"],
     imageReferer: "https://www.example.com/",
   };
   ```

3. **Implement `index.ts`**. The goal is simple: validate URL, request page/API data through `this.request`, parse media fields, then return `PostResult`.

   ```typescript
   import { ExtensionContext, PostResult } from "../../core/types";
   import { BaseExtension } from "../../core/base";
   import { myExtensionManifest } from "./manifest";

   export class MyExtension extends BaseExtension {
     manifest = myExtensionManifest;

     async extract(
       url: string,
       context: ExtensionContext,
     ): Promise<PostResult> {
       const match = url.match(
         /^https?:\/\/(?:www\.)?example\.com\/post\/([a-zA-Z0-9_-]+)/i,
       );
       if (!match) {
         throw new Error("Invalid my-extension URL format");
       }

       const postId = match[1];
       const apiUrl = `https://api.example.com/posts/${postId}`;
       const response = await this.request(apiUrl, context);
       if (!response.ok) {
         throw new Error(`API responded with status ${response.status}`);
       }

       const data = await response.json();
       if (!data?.media?.url) {
         throw new Error("Media URL not found in API response");
       }

       const mediaType =
         data.media.type === "video" ? "single_video" : "single_image";
       const itemType = data.media.type === "video" ? "video" : "image";

       return {
         id: String(data.id ?? postId),
         platform: this.manifest.name,
         author: {
           username: data.author?.username || "unknown_author",
           avatar: data.author?.avatar || "",
           verified: Boolean(data.author?.verified),
         },
         caption: data.caption || "",
         mediaType,
         items: [
           {
             id: String(data.media.id ?? "media-1"),
             type: itemType,
             url: data.media.url,
             thumbnail: data.media.thumbnail || "",
           },
         ],
         timestamp: data.timestamp || new Date().toISOString(),
       };
     }
   }

   export const myExtension = new MyExtension();
   export default myExtension;
   ```

---

## 🏗️ Build & Test

### 1. Test / Debug Extension (CLI)

You can test any extension directly with a target URL without running the main web application:

```bash
# Auto-detect extension by URL regex
pnpm test -- "https://www.pixiv.net/en/artworks/xxxxxxxxx"

# Or specify extension ID explicitly
pnpm test -- pixiv "https://www.pixiv.net/en/artworks/xxxxxxxxx"

# Test with session cookies (Netscape format or raw header)
pnpm test -- instagram "https://www.instagram.com/p/xxxxxxxxxxx" --cookie="sessionid=xyz; ds_user_id=123"

# Test with session cookies file (Netscape format or raw header)
pnpm test -- instagram "https://www.instagram.com/p/xxxxxxxxxxx" --cookie-file="cookies.txt"

# Test with FlareSolverr for Cloudflare bypass testing
pnpm test -- deviantart "https://www.deviantart.com/xxx/art/xxx-xxx-xxx" --flaresolverr="http://localhost:8191"

```

### 2. Type Check & Bundle

```bash
# Check TypeScript types
pnpm run type-check

# Build bundles and index.json
pnpm run build
```

The build output will be generated inside the `dist/` directory:

# Check TypeScript types

```bash
pnpm run type-check
```

# Build bundles and index.json

```bash
pnpm run build
```

The build output will be generated inside the `dist/` directory:

- `dist/<id>.js`: Self-contained bundle for each extension.
- `dist/index.json`: Repository index containing metadata and bundle checksums.
