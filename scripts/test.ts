import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionContext,
  PostResult,
  DownloaderExtension,
} from "../src/core/types";

// Helper to parse CLI flags
function parseArgs() {
  const args = process.argv.slice(2);
  let targetUrl = "";
  let targetExtensionId = "";
  let cookieInput = "";
  let cookieFile = "";
  let flaresolverrUrl = "";

  for (const arg of args) {
    if (arg.startsWith("--cookie=") || arg.startsWith("--cookies=")) {
      cookieInput = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--cookie-file=")) {
      cookieFile = arg.slice("--cookie-file=".length);
    } else if (arg.startsWith("--flaresolverr=")) {
      flaresolverrUrl = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("http://") || arg.startsWith("https://")) {
      targetUrl = arg;
    } else if (!targetExtensionId && !arg.startsWith("-")) {
      targetExtensionId = arg;
    }
  }

  // If user only provided a URL without extension ID, targetExtensionId may be empty
  return {
    targetExtensionId,
    targetUrl,
    cookieInput,
    cookieFile,
    flaresolverrUrl,
  };
}

interface NetscapeCookie {
  domain: string;
  includeSubdomains: boolean;
  path: string;
  secure: boolean;
  expiresAt: number;
  name: string;
  value: string;
}

function loadCookieFile(cookieFile: string): NetscapeCookie[] {
  const contents = fs.readFileSync(cookieFile, "utf8");
  const cookies: NetscapeCookie[] = [];

  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    let line = rawLine;
    if (!line || (line.startsWith("#") && !line.startsWith("#HttpOnly_")))
      continue;

    if (line.startsWith("#HttpOnly_")) {
      line = line.slice("#HttpOnly_".length);
    }

    const fields = line.split("\t");
    if (fields.length !== 7) {
      throw new Error(
        `Invalid Netscape cookie entry at ${cookieFile}:${index + 1}`,
      );
    }

    const expiresAt = Number(fields[4]);
    if (!Number.isFinite(expiresAt)) {
      throw new Error(
        `Invalid cookie expiration at ${cookieFile}:${index + 1}`,
      );
    }

    cookies.push({
      domain: fields[0].replace(/^\./, "").toLowerCase(),
      includeSubdomains: fields[1].toUpperCase() === "TRUE",
      path: fields[2] || "/",
      secure: fields[3].toUpperCase() === "TRUE",
      expiresAt,
      name: fields[5],
      value: fields[6],
    });
  }

  return cookies;
}

function cookiesForUrl(cookies: NetscapeCookie[], url: URL): string {
  const now = Date.now() / 1000;
  return cookies
    .filter((cookie) => {
      const domainMatches =
        url.hostname === cookie.domain ||
        (cookie.includeSubdomains &&
          url.hostname.endsWith(`.${cookie.domain}`));
      const pathMatches =
        url.pathname === cookie.path ||
        url.pathname.startsWith(
          cookie.path.endsWith("/") ? cookie.path : `${cookie.path}/`,
        );
      return (
        domainMatches &&
        pathMatches &&
        (!cookie.secure || url.protocol === "https:") &&
        (cookie.expiresAt === 0 || cookie.expiresAt > now)
      );
    })
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function loadExtensions(
  extensionsDir: string,
): Promise<Map<string, DownloaderExtension>> {
  const map = new Map<string, DownloaderExtension>();
  const dirs = fs.readdirSync(extensionsDir);

  for (const dir of dirs) {
    const extDir = path.join(extensionsDir, dir);
    if (!fs.statSync(extDir).isDirectory()) continue;

    const indexPath = path.join(extDir, "index.ts");
    if (!fs.existsSync(indexPath)) continue;

    try {
      const mod = await import(indexPath);
      const instance: DownloaderExtension =
        mod.default || mod[`${dir}Extension`] || Object.values(mod)[0];
      if (instance && instance.manifest) {
        map.set(instance.manifest.id, instance);
      }
    } catch (err) {
      console.warn(`[WARN] Failed to load extension ${dir}:`, err);
    }
  }

  return map;
}

// Build standard ExtensionContext with fetch wrapper
function createTestContext(
  cookieInput: string,
  cookieJar: NetscapeCookie[],
  flaresolverrUrl?: string,
): ExtensionContext {
  const customFetch: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers || {});

    if (!headers.has("Cookie") && !headers.has("cookie")) {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const cookieHeader =
        cookieInput || cookiesForUrl(cookieJar, new URL(requestUrl));
      if (cookieHeader) {
        headers.set("Cookie", cookieHeader);
      }
    }

    if (!headers.has("User-Agent") && !headers.has("user-agent")) {
      headers.set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
      );
    }

    // Direct fetch
    let res = await fetch(input, { ...init, headers });

    // Optional FlareSolverr integration for Cloudflare challenge testing
    if (flaresolverrUrl && (res.status === 403 || res.status === 503)) {
      const text = await res.clone().text();
      if (
        text.includes("cf-browser-verification") ||
        text.includes("Just a moment...")
      ) {
        console.log(
          `🛡️ Cloudflare challenge detected! Forwarding to FlareSolverr: ${flaresolverrUrl}`,
        );
        const targetUrl =
          typeof input === "string" ? input : (input as Request).url;
        const fsRes = await fetch(`${flaresolverrUrl}/v1`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cmd: "request.get",
            url: targetUrl,
            maxTimeout: 60000,
          }),
        });
        const fsData = (await fsRes.json()) as {
          solution?: { response?: string; status?: number };
        };
        if (fsData.solution?.response) {
          return new Response(fsData.solution.response, {
            status: fsData.solution.status || 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
      }
    }

    return res;
  };

  return {
    fetch: customFetch,
    getCookie: async () => cookieInput || null,
  };
}

async function main() {
  const {
    targetExtensionId,
    targetUrl,
    cookieInput,
    cookieFile,
    flaresolverrUrl,
  } = parseArgs();

  if (cookieInput && cookieFile) {
    throw new Error("Use either --cookie or --cookie-file, not both.");
  }
  const cookieJar = cookieFile ? loadCookieFile(cookieFile) : [];

  if (!targetUrl) {
    console.log(`
🔍 MediaDL Extension Test Runner
Usage:
  npx tsx scripts/test.ts <url> [options]
  npx tsx scripts/test.ts <extension-id> <url> [options]

Examples:
  npx tsx scripts/test.ts "https://www.pixiv.net/en/artworks/xxxxxxxxx"
  npx tsx scripts/test.ts instagram "https://www.instagram.com/p/DF2s8w9vY_1/" --cookie="sessionid=..."
  npx tsx scripts/test.ts deviantart "https://www.deviantart.com/xxx/art/xxx-xxx-xxx" --flaresolverr="http://localhost:8191"

Options:
  --cookie="<cookies>"          Netscape cookie string or raw Cookie header
--cookie-file="<path>"        Netscape cookies.txt file
--flaresolverr="<endpoint>"   FlareSolverr proxy endpoint (default: disabled)
`);
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, "..");
  const extensionsDir = path.join(rootDir, "src", "extensions");

  console.log(`\n📦 Loading extensions from ${extensionsDir}...`);
  const extensions = await loadExtensions(extensionsDir);

  let selectedExtension: DownloaderExtension | undefined;

  if (targetExtensionId) {
    selectedExtension = extensions.get(targetExtensionId);
    if (!selectedExtension) {
      console.error(`❌ Extension with ID "${targetExtensionId}" not found.`);
      console.log(
        `Available extensions: ${Array.from(extensions.keys()).join(", ")}`,
      );
      process.exit(1);
    }
  } else {
    // Match by URL regex
    for (const ext of extensions.values()) {
      if (ext.manifest.urlPatterns.some((pattern) => pattern.test(targetUrl))) {
        selectedExtension = ext;
        break;
      }
    }
  }

  if (!selectedExtension) {
    console.error(`❌ No extension matched URL: ${targetUrl}`);
    console.log(`Registered extensions:`);
    for (const [id, ext] of extensions.entries()) {
      console.log(`  - ${id} (${ext.manifest.name})`);
    }
    process.exit(1);
  }

  console.log(
    `🎯 Matched Extension : ${selectedExtension.manifest.name} (v${selectedExtension.manifest.version}) [ID: ${selectedExtension.manifest.id}]`,
  );
  console.log(`🔗 Target URL         : ${targetUrl}`);
  if (cookieInput || cookieFile) {
    console.log(
      `🍪 Cookies            : ${cookieFile ? `Loaded ${cookieJar.length} from ${cookieFile}` : `Provided (${cookieInput.length} chars)`}`,
    );
  }
  if (flaresolverrUrl) {
    console.log(`🛡️ FlareSolverr       : ${flaresolverrUrl}`);
  }

  console.log(`\n⏳ Running extraction...`);
  const startTime = Date.now();
  const context = createTestContext(cookieInput, cookieJar, flaresolverrUrl);

  try {
    const result: PostResult = await selectedExtension.extract(
      targetUrl,
      context,
    );
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n✅ Extraction SUCCESS in ${duration}s!\n`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`ID         : ${result.id}`);
    console.log(`Platform   : ${result.platform}`);
    console.log(
      `Author     : ${result.author.username}${result.author.verified ? " (Verified)" : ""}`,
    );
    if (result.author.avatar) {
      console.log(`Avatar     : ${result.author.avatar}`);
    }
    if (result.caption) {
      console.log(
        `Caption    : ${result.caption.slice(0, 100)}${result.caption.length > 100 ? "..." : ""}`,
      );
    }
    console.log(`Media Type : ${result.mediaType}`);
    console.log(`Item Count : ${result.items.length} item(s)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    console.log(`\n📸 Extracted Items:`);
    result.items.forEach((item, index) => {
      console.log(`  [${index + 1}] Type: ${item.type.toUpperCase()}`);
      console.log(`      URL   : ${item.url}`);
      if (item.thumbnail) {
        console.log(`      Thumb : ${item.thumbnail}`);
      }
      if (item.formats && item.formats.length > 0) {
        console.log(`      Formats (${item.formats.length}):`);
        item.formats.forEach((f) => {
          console.log(
            `        - ${f.formatId} (${f.quality || "standard"}, ${f.ext}) -> ${f.url}`,
          );
        });
      }
    });

    console.log(`\n📄 Full Result JSON:`);
    console.log(JSON.stringify(result, null, 2));
  } catch (err: unknown) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n❌ Extraction FAILED in ${duration}s!`);
    if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
      if (err.stack) {
        console.error(`\nStack Trace:\n${err.stack}`);
      }
    } else {
      console.error(String(err));
    }
    process.exit(1);
  }
}

main();
