import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { pixivManifest } from "./manifest";

interface PixivPageUrl {
  original: string;
  regular: string;
  small?: string;
  thumb?: string;
  thumb_mini?: string;
}

interface PixivArtworkResponse {
  error: boolean;
  message: string;
  body?: {
    illustId: string;
    illustTitle: string;
    illustComment: string;
    createDate: string;
    uploadDate: string;
    userId: string;
    userName: string;
    userAccount: string;
    userProfileImageUrl: string;
    pageCount: number;
    urls: PixivPageUrl;
  };
}

interface PixivPagesResponse {
  error: boolean;
  message: string;
  body?: Array<{
    urls: PixivPageUrl;
  }>;
}

function cleanHtmlText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*[\/]?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<a\b[^>]*href=["'](?:\/jump\.php\?)?([^"']+)["'][^>]*>(.*?)<\/a>/gi, (_, targetUrl, linkText) => {
      try {
        return decodeURIComponent(targetUrl);
      } catch {
        return linkText || targetUrl;
      }
    })
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class PixivExtension extends BaseExtension {
  manifest = pixivManifest;

  protected getCustomHeaders(_url: string, _context: ExtensionContext): Record<string, string> {
    return {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.pixiv.net/",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept": "application/json, text/plain, */*",
    };
  }

  public processMediaItem(item: MediaItem): MediaItem {
    return {
      ...item,
      url: `/api/proxy?url=${encodeURIComponent(item.url)}`,
      thumbnail: item.thumbnail ? `/api/proxy?url=${encodeURIComponent(item.thumbnail)}` : item.thumbnail
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const match = url.match(/artworks\/([0-9]+)/i);
    const illustId = match ? match[1] : null;

    if (!illustId) {
      throw new Error("Invalid Pixiv URL format or artwork ID not found.");
    }

    const apiUrl = `https://www.pixiv.net/ajax/illust/${illustId}`;
    const response = await this.request(apiUrl, context);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("Pixiv artwork not found or has been deleted.");
      }
      throw new Error(`Failed to fetch data from Pixiv (HTTP ${response.status})`);
    }

    const json = (await response.json()) as PixivArtworkResponse;

    if (json.error || !json.body) {
      throw new Error(json.message || "Failed to fetch artwork details from Pixiv. Login or PHPSESSID cookie may be required.");
    }

    const data = json.body;

    if (!data.urls || !data.urls.original) {
      throw new Error("This artwork is restricted (NSFW/R-18 or private) and requires login or PHPSESSID cookie to download.");
    }

    const rawItems: MediaItem[] = [];

    if (data.pageCount > 1) {
      const pagesUrl = `https://www.pixiv.net/ajax/illust/${illustId}/pages`;
      const pagesRes = await this.request(pagesUrl, context);
      
      if (pagesRes.ok) {
        const pagesJson = (await pagesRes.json()) as PixivPagesResponse;
        if (!pagesJson.error && pagesJson.body && pagesJson.body.length > 0) {
          pagesJson.body.forEach((page, index) => {
            const imageUrl = page.urls.original || page.urls.regular;
            rawItems.push({
              id: `${illustId}_p${index}`,
              type: "image",
              url: imageUrl,
              thumbnail: page.urls.small || page.urls.thumb || page.urls.thumb_mini || imageUrl,
              quality: "original"
            });
          });
        }
      }
    }

    if (rawItems.length === 0) {
      const imageUrl = data.urls.original || data.urls.regular;
      rawItems.push({
        id: `${illustId}_p0`,
        type: "image",
        url: imageUrl,
        thumbnail: data.urls.small || data.urls.thumb || data.urls.thumb_mini || imageUrl,
        quality: "original"
      });
    }

    const items = rawItems.map(item => this.processMediaItem ? this.processMediaItem(item) : item);

    const authorAvatar = data.userProfileImageUrl || '';

    const mediaType = items.length > 1 ? "carousel" : "single_image";
    const cleanComment = cleanHtmlText(data.illustComment || "");

    return {
      id: illustId,
      platform: "Pixiv",
      author: {
        username: data.userAccount || data.userName,
        avatar: authorAvatar,
        verified: false,
      },
      caption: data.illustTitle ? `${data.illustTitle}\n\n${cleanComment}`.trim() : cleanComment,
      mediaType,
      items,
      timestamp: data.createDate || new Date().toISOString(),
    };
  }
}

export const pixivExtension = new PixivExtension();

export default pixivExtension;
