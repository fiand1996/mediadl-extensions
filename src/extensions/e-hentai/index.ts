import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { eHentaiManifest } from "./manifest";

const MAX_PAGES = 2; // Limit the number of pages to fetch to avoid excessive requests for large galleries

export class EHentaiExtension extends BaseExtension {
  manifest = eHentaiManifest;

  protected getCustomHeaders(url: string, context: ExtensionContext): Record<string, string> {
    return {
      "Cookie": "nw=1",
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
    const match = url.match(/\/g\/([0-9]+)\/([a-zA-Z0-9]+)/i);
    const galleryId = match ? match[1] : null;
    const galleryToken = match ? match[2] : null;

    if (!galleryId || !galleryToken) {
      throw new Error("Invalid E-Hentai gallery URL format.");
    }

    const cleanBaseUrl = `https://e-hentai.org/g/${galleryId}/${galleryToken}/`;
    
    // Generate page URLs up to MAX_PAGES with nw=always
    const pageUrls: string[] = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      pageUrls.push(p === 0 ? `${cleanBaseUrl}?nw=always` : `${cleanBaseUrl}?p=${p}&nw=always`);
    }

    const responses = await Promise.all(
      pageUrls.map(pageUrl => this.request(pageUrl, context).catch((err) => {
        console.error(`[EHentai] Failed to fetch gallery page ${pageUrl}:`, err);
        return null;
      }))
    );

    const detailUrls: string[] = [];
    let fullTitle = `E-Hentai Gallery ${galleryId}`;

    for (let i = 0; i < responses.length; i++) {
      const res = responses[i];
      if (!res || !res.ok) continue;
      const html = await res.text();

      if (i === 0) {
        const titleMatch = html.match(/<h1[^>]*id="gn"[^>]*>([^<]+)<\/h1>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = titleMatch ? titleMatch[1].trim() : fullTitle;
        const jpTitleMatch = html.match(/<h1[^>]*id="gj"[^>]*>([^<]+)<\/h1>/i);
        const subtitle = jpTitleMatch ? jpTitleMatch[1].trim() : "";
        fullTitle = subtitle ? `${title} (${subtitle})` : title;
      }

      const linkRegex = /<a[^>]*href=["']((?:https?:\/\/(?:e-hentai|exhentai)\.org)?\/s\/[a-zA-Z0-9]+\/[0-9]+-[0-9]+)["'][^>]*>/gi;
      let lm;
      while ((lm = linkRegex.exec(html)) !== null) {
        let link = lm[1];
        if (link.startsWith("/s/")) {
          link = `https://e-hentai.org${link}`;
        }
        if (!detailUrls.includes(link)) {
          detailUrls.push(link);
        }
      }
    }

    if (detailUrls.length === 0) {
      throw new Error("No image detail links found in this E-Hentai gallery.");
    }

    // Fetch full image URLs with limited concurrency to avoid overwhelming FlareSolverr
    const concurrency = 3;
    const items: MediaItem[] = [];

    for (let i = 0; i < detailUrls.length; i += concurrency) {
      const chunk = detailUrls.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (detailUrl, chunkIdx) => {
          const index = i + chunkIdx;
          let imageUrl = "";
          try {
            const detailRes = await this.request(detailUrl, context);
            if (detailRes.ok) {
              const detailHtml = await detailRes.text();
              const imgMatch = detailHtml.match(/<img[^>]*id="img"[^>]*src=["']([^"']+)["']/i);
              if (imgMatch && imgMatch[1]) {
                imageUrl = imgMatch[1];
              }
            }
          } catch (err) {}

          const mediaItem: MediaItem = {
            id: `${galleryId}_${index + 1}`,
            type: "image",
            url: imageUrl || detailUrl,
            thumbnail: imageUrl || detailUrl,
            quality: "original"
          };
          return this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem;
        })
      );
      items.push(...chunkResults);
    }
    const validItems = items.filter(item => item.url && !item.url.includes("/s/"));
    const finalItems = validItems.length > 0 ? validItems : items;
    const coverImage = finalItems[0]?.thumbnail || "";

    return {
      id: galleryId,
      platform: "E-Hentai",
      author: {
        username: "E-Hentai",
        avatar: coverImage,
        verified: false,
      },
      caption: fullTitle,
      mediaType: finalItems.length > 1 ? "carousel" : "single_image",
      items: finalItems,
      timestamp: new Date().toISOString(),
    };
  }
}

export const eHentaiExtension = new EHentaiExtension();

export default eHentaiExtension;
