import { ExtensionContext, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { civitaiManifest } from "./manifest";

interface CivitaiImageData {
  id?: string | number;
  url?: string;
  hash?: string;
  name?: string;
  postId?: number;
  username?: string;
  user?: {
    username?: string;
    image?: string;
  };
  owner?: {
    username?: string;
    image?: string;
  };
  createdAt?: string;
  meta?: {
    prompt?: string;
    negativePrompt?: string;
    steps?: number;
    sampler?: string;
    cfgScale?: number;
  };
  metadata?: CivitaiImageData["meta"];
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

function extractImageUrlsFromHtml(html: string): string[] {
  const imageUrls: Array<{ url: string; primary: boolean }> = [];

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = tag[0];
    const sourceMatch = attributes.match(
      /\b(?:src|data-src|data-original)\s*=\s*(["'])(.*?)\1/i,
    );
    if (!sourceMatch) continue;

    const source = decodeHtmlAttribute(sourceMatch[2]).replace(/\\\//g, "/");
    try {
      const imageUrl = new URL(source, "https://civitai.red/");
      if (
        imageUrl.protocol === "https:" &&
        /(^|\.)image\.civitai\.com$|(^|\.)getimg\.ai$|(^|\.)givitai\.com$/i.test(imageUrl.hostname) &&
        /\/original=true\//i.test(imageUrl.pathname)
      ) {
        imageUrls.push({
          url: imageUrl.href,
          primary: /\bq32jQG_image\b/.test(attributes),
        });
      }
    } catch {
      continue;
    }
  }

  const uniqueImages = [...new Map(imageUrls.map((image) => [image.url, image])).values()];
  const hasPrimaryImage = uniqueImages.some((image) => image.primary);
  return uniqueImages
    .filter((image) => !hasPrimaryImage || image.primary)
    .sort((a, b) => {
      const aOriginal = a.url.includes("/original=true/");
      const bOriginal = b.url.includes("/original=true/");
      return Number(bOriginal) - Number(aOriginal);
    })
    .map((image) => image.url);
}

export class CivitaiExtension extends BaseExtension {
  manifest = civitaiManifest;

  protected getCustomHeaders(
    url: string,
    context: ExtensionContext,
  ): Record<string, string> {
    const isApiRequest = new URL(url).pathname.startsWith("/api/");
    return {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      Accept: isApiRequest
        ? "application/json, text/plain, */*"
        : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en,en-US;q=0.9,id;q=0.8,ja;q=0.7,zh-CN;q=0.6,zh;q=0.5",
      Referer: `${new URL(url).origin}/`,
      ...(isApiRequest
        ? {}
        : {
            "Cache-Control": "max-age=0",
            "Sec-CH-UA": '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"macOS"',
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Upgrade-Insecure-Requests": "1",
          }),
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const imageMatch = url.match(
      /^https?:\/\/(?:www\.)?civitai\.(?:com|red)\/images\/([0-9]+)/i,
    );

    if (!imageMatch) {
      throw new Error(`Invalid Civitai URL format: ${url}`);
    }

    const imageId = imageMatch[1];
    const requestedOrigin = new URL(url).origin.replace("://www.", "://");
    const fallbackOrigin = requestedOrigin.endsWith(".red")
      ? "https://civitai.com"
      : "https://civitai.red";
    const apiOrigins = [requestedOrigin, fallbackOrigin];
    let items: PostResult["items"] = [];
    let authorInfo = { username: "civitai_user", avatar: "", verified: false };
    let caption = "";
    let createdAt = new Date().toISOString();
    let targetImage: CivitaiImageData | null = null;
    let postImages: CivitaiImageData[] = [];
    const apiDiagnostics: string[] = [];
    let htmlText = "";
    let pageStatus = 0;
    let pageBlockedByCloudflare = false;

    for (const apiOrigin of apiOrigins) {
      const apiUrl = `${apiOrigin}/api/v1/images?imageId=${imageId}&limit=1`;
      try {
        const res = await this.request(apiUrl, context);
        if (!res.ok) {
          apiDiagnostics.push(`${new URL(apiUrl).host}: HTTP ${res.status}`);
          continue;
        }
        const resData = await res.json() as { items?: CivitaiImageData[] };
        const found = resData.items?.find(
          (item) => String(item.id) === imageId,
        );
        if (found) {
          targetImage = found;
          break;
        }
        apiDiagnostics.push(
          `${new URL(apiUrl).host}: HTTP ${res.status}, image not present in items`,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.name : "UnknownError";
        apiDiagnostics.push(`${new URL(apiUrl).host}: ${reason}`);
      }
    }

    if (!targetImage) {
      const pageRes = await this.request(url, context);
      htmlText = await pageRes.text();
      pageStatus = pageRes.status;
      pageBlockedByCloudflare =
        pageRes.headers.get("cf-mitigated") === "challenge";
    }

    const matchData = htmlText.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
    );
    if (!targetImage && matchData) {
      try {
        const nextData = JSON.parse(matchData[1]);
        const trpcState = nextData.props.pageProps.trpcState;
        const str = JSON.stringify(trpcState);

        const searchToken = `,${imageId},`;
        let idx = str.indexOf(searchToken);
        if (idx === -1) {
          const searchTokenNum = `:${imageId},`;
          idx = str.indexOf(searchTokenNum);
        }
        if (idx === -1) {
          const searchTokenArr = `[${imageId},`;
          idx = str.indexOf(searchTokenArr);
        }

        if (idx !== -1) {
          const chunk = str.slice(idx, idx + 400);
          const uuidMatch = chunk.match(
            /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
          );
          if (uuidMatch) {
            targetImage = {
              id: Number(imageId),
              hash: uuidMatch[1],
            };
          }

          const postMatch = chunk.match(/null,([0-9]{7,10}),/);
          if (postMatch) {
            targetImage = targetImage || {};
            targetImage.postId = Number(postMatch[1]);
          }
        }
      } catch (e) {}
    }

    if (!targetImage) {
      let ogMatch = htmlText.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i);
      if (!ogMatch) {
        const reverseMatch = htmlText.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
        if (reverseMatch) ogMatch = reverseMatch;
      }
      if (ogMatch?.[1]) {
        targetImage = { id: Number(imageId), url: ogMatch[1].replace(/&amp;/g, "&") };
      }
    }

    if (!targetImage) {
      if (pageBlockedByCloudflare) {
        throw new Error(
          `Civitai page request was blocked by Cloudflare (HTTP ${pageStatus}); no image HTML was available to parse.`,
        );
      }
      throw new Error(
        `Civitai image ${imageId} could not be extracted. Page returned HTTP ${pageStatus}; API results: ${apiDiagnostics.join("; ") || "no matching image data"}.`,
      );
    }

    const postId = targetImage.postId;
    if (postId) {
      for (const apiOrigin of apiOrigins) {
        try {
          const postApiUrl = `${apiOrigin}/api/v1/images?postId=${postId}&limit=100`;
          const postRes = await this.request(postApiUrl, context);
          if (!postRes.ok) continue;
          const postResData = await postRes.json() as {
            items?: CivitaiImageData[];
          };
          if (postResData.items && postResData.items.length > 0) {
            postImages = postResData.items;
            break;
          }
        } catch (e) {}
      }
    }

    if (postImages.length === 0) {
      postImages = [targetImage];
    }

    for (const img of postImages) {
      let imgUrl = img.url;
      if (!imgUrl && img.hash) {
        imgUrl = `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${img.hash}/original=true/${img.name || "image.jpeg"}`;
      }
      if (imgUrl) {
        const thumb = imgUrl.includes("?")
          ? `${imgUrl}&width=450`
          : `${imgUrl}?width=450`;
        items.push({
          id: String(img.id || imageId),
          type: "image",
          url: imgUrl,
          thumbnail: thumb,
        });
      }
    }

    const username =
      targetImage.username ||
      targetImage.user?.username ||
      targetImage.owner?.username ||
      "civitai_user";
    authorInfo = {
      username,
      avatar: targetImage.user?.image || targetImage.owner?.image || "",
      verified: false,
    };

    if (targetImage.createdAt) {
      createdAt = new Date(targetImage.createdAt).toISOString();
    }

    const metaObj = targetImage.meta || targetImage.metadata;
    if (metaObj) {
      const parts: string[] = [];
      const prompt = metaObj.prompt;
      const negPrompt = metaObj.negativePrompt;
      const steps = metaObj.steps;
      const sampler = metaObj.sampler;
      const cfg = metaObj.cfgScale;

      if (prompt) parts.push(`Prompt: ${prompt}`);
      if (negPrompt) parts.push(`Negative Prompt: ${negPrompt}`);
      if (steps || sampler || cfg)
        parts.push(
          `Steps: ${steps || "?"}, Sampler: ${sampler || "?"}, CFG scale: ${cfg || "?"}`,
        );
      caption = parts.join("\n\n");
    }

    if (items.length === 0) {
      throw new Error(`No media items found in Civitai URL: ${url}`);
    }

    const mediaType = items.length > 1 ? "carousel" : "single_image";

    return {
      id: String(imageId),
      platform: this.manifest.name,
      author: authorInfo,
      caption,
      mediaType,
      items,
      timestamp: createdAt,
    };
  }
}

export const civitaiExtension = new CivitaiExtension();
export default civitaiExtension;
