import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { threeHentaiManifest } from "./manifest";

export class ThreeHentaiExtension extends BaseExtension {
  manifest = threeHentaiManifest;

  protected getCustomHeaders(url: string, context: ExtensionContext): Record<string, string> {
    return {
      "Referer": "https://3hentai.net/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
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
    const match = url.match(/\/d\/([0-9]+)/i);
    const galleryId = match ? match[1] : null;

    if (!galleryId) {
      throw new Error("Invalid 3Hentai gallery URL format.");
    }

    const cleanUrl = `https://3hentai.net/d/${galleryId}/`;
    const res = await this.request(cleanUrl, context);
    if (!res.ok) {
      throw new Error(`Failed to fetch 3Hentai gallery page: HTTP ${res.status}`);
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) || html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : `3Hentai Gallery ${galleryId}`;
    title = title.replace(/\s*-\s*3Hentai\.net.*$/i, "").trim();

    const pageLinks: { pageUrl: string; thumbUrl: string }[] = [];

    // Match single-thumb or standard thumb containers
    const thumbRegex = /<a[^>]*href=["']([^"']+\/d\/[0-9]+\/[0-9]+|[^"']+\/g\/[0-9]+\/[0-9]+|[^"']+\/[0-9]+)["'][^>]*>[\s\S]*?<img[^>]*(?:data-src|src)=["']([^"']+)["']/gi;
    
    let matchThumb;
    while ((matchThumb = thumbRegex.exec(html)) !== null) {
      let pageHref = matchThumb[1];
      let thumbSrc = matchThumb[2];

      if (pageHref.startsWith("/")) {
        pageHref = `https://3hentai.net${pageHref}`;
      }
      if (!pageLinks.some(p => p.pageUrl === pageHref)) {
        pageLinks.push({ pageUrl: pageHref, thumbUrl: thumbSrc });
      }
    }

    // If still empty, try matching all <img> with data-src or src from s*.3hentai.net
    if (pageLinks.length === 0) {
      const imgRegex = /<img[^>]*(?:data-src|src)=["'](https?:\/\/[^"']*3hentai\.net[^"']*)["']/gi;
      let imgM;
      while ((imgM = imgRegex.exec(html)) !== null) {
        const thumbUrl = imgM[1];
        pageLinks.push({ pageUrl: cleanUrl, thumbUrl });
      }
    }

    const items: MediaItem[] = [];
    const concurrency = 5;

    for (let i = 0; i < pageLinks.length; i += concurrency) {
      const chunk = pageLinks.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (pItem, chunkIdx) => {
          const index = i + chunkIdx;
          let imageUrl = pItem.thumbUrl.replace(/t\.jpg$/, '.jpg').replace(/t\.png$/, '.png').replace(/t\.webp$/, '.webp');
          
          if (pItem.pageUrl !== cleanUrl) {
            try {
              const pageRes = await this.request(pItem.pageUrl, context);
              if (pageRes.ok) {
                const pageHtml = await pageRes.text();
                const mainImgMatch = pageHtml.match(/<img[^>]*id=["']image["'][^>]*src=["']([^"']+)["']/i) ||
                                     pageHtml.match(/<img[^>]*class=["'][^"']*gallery-image[^"']*["'][^>]*src=["']([^"']+)["']/i) ||
                                     pageHtml.match(/<div[^>]*class=["'][^"']*image-container[^"']*["'][\s\S]*?<img[^>]*src=["']([^"']+)["']/i) ||
                                     pageHtml.match(/<img[^>]*src=["'](https?:\/\/[^"']+\/[0-9]+\.(?:jpg|png|webp))["']/i);
                if (mainImgMatch && mainImgMatch[1]) {
                  imageUrl = mainImgMatch[1];
                }
              }
            } catch (err) {}
          }

          const mediaItem: MediaItem = {
            id: `${galleryId}_${index + 1}`,
            type: "image",
            url: imageUrl,
            thumbnail: pItem.thumbUrl,
            quality: "original"
          };
          return this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem;
        })
      );
      items.push(...chunkResults);
    }

    if (items.length === 0) {
      throw new Error("No images found in this 3Hentai gallery.");
    }

    const coverImage = items[0]?.thumbnail || "";

    return {
      id: galleryId,
      platform: "3Hentai",
      author: {
        username: "3Hentai",
        avatar: coverImage,
        verified: false,
      },
      caption: title,
      mediaType: items.length > 1 ? "carousel" : "single_image",
      items,
      timestamp: new Date().toISOString(),
    };
  }
}

export const threeHentaiExtension = new ThreeHentaiExtension();

export default threeHentaiExtension;
