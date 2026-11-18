import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { cosplayteleManifest } from "./manifest";

export class CosplayTeleExtension extends BaseExtension {
  manifest = cosplayteleManifest;

  protected getCustomHeaders(url: string, context: ExtensionContext): Record<string, string> {
    return {
      "Referer": "https://cosplaytele.com/",
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
    const res = await this.request(url, context);
    if (!res.ok) {
      throw new Error(`Failed to fetch CosplayTele page: HTTP ${res.status}`);
    }

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^<]+)<\/title>/i);
    let title = titleMatch ? titleMatch[1].trim() : "CosplayTele Gallery";
    title = title.replace(/\s*–\s*CosplayTele.*$/i, "").replace(/\s*-\s*CosplayTele.*$/i, "").trim();

    const items: MediaItem[] = [];

    // Match gallery items or direct anchor hrefs with images
    // <figure class="gallery-item"> ... <a href="FULL_URL"...><img src="THUMB_URL"...></a> ... </figure>
    // Or generic gallery-icon / fancyboxforwp links
    const galleryItemRegex = /<figure[^>]*class=["'][^"']*gallery-item[^"']*["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/gi;
    
    let match;
    let idx = 0;
    while ((match = galleryItemRegex.exec(html)) !== null) {
      const fullUrl = match[1];
      const thumbUrl = match[2];
      idx++;
      const mediaItem: MediaItem = {
        id: `cosplaytele_${idx}`,
        type: "image",
        url: fullUrl,
        thumbnail: thumbUrl,
        quality: "original"
      };
      items.push(this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem);
    }

    // Fallback: match any fancybox or wp-content/uploads images inside article/content
    if (items.length === 0) {
      const imgLinkRegex = /<a[^>]*href=["'](https?:\/\/[^"']+\/wp-content\/uploads\/[^"']+\.(?:jpg|jpeg|png|webp))["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/gi;
      while ((match = imgLinkRegex.exec(html)) !== null) {
        const fullUrl = match[1];
        const thumbUrl = match[2];
        if (!items.some(it => it.url.includes(fullUrl))) {
          idx++;
          const mediaItem: MediaItem = {
            id: `cosplaytele_${idx}`,
            type: "image",
            url: fullUrl,
            thumbnail: thumbUrl,
            quality: "original"
          };
          items.push(this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem);
        }
      }
    }

    // Final fallback: all wp-content/uploads images
    if (items.length === 0) {
      const genericImgRegex = /<img[^>]*src=["'](https?:\/\/[^"']+\/wp-content\/uploads\/[^"']+\.(?:jpg|jpeg|png|webp))["']/gi;
      while ((match = genericImgRegex.exec(html)) !== null) {
        const imgUrl = match[1];
        if (!items.some(it => it.url.includes(imgUrl))) {
          idx++;
          const mediaItem: MediaItem = {
            id: `cosplaytele_${idx}`,
            type: "image",
            url: imgUrl,
            thumbnail: imgUrl,
            quality: "original"
          };
          items.push(this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem);
        }
      }
    }

    if (items.length === 0) {
      throw new Error("No images found in this CosplayTele gallery.");
    }

    const coverImage = items[0]?.thumbnail || "";
    const parsedUrl = new URL(url);
    const galleryId = parsedUrl.pathname.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "gallery";

    return {
      id: galleryId,
      platform: "CosplayTele",
      author: {
        username: "CosplayTele",
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

export const cosplayteleExtension = new CosplayTeleExtension();

export default cosplayteleExtension;
