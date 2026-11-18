import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { babesourceManifest } from "./manifest";

export class BabeSourceExtension extends BaseExtension {
  manifest = babesourceManifest;

  public processMediaItem(item: MediaItem): MediaItem {
    return {
      ...item,
      url: `/api/proxy?url=${encodeURIComponent(item.url)}`,
      thumbnail: item.thumbnail ? `/api/proxy?url=${encodeURIComponent(item.thumbnail)}` : item.thumbnail
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const response = await this.request(url, context);
    if (!response.ok) {
      throw new Error(`Failed to fetch BabeSource gallery (HTTP ${response.status})`);
    }

    const html = await response.text();

    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : "BabeSource Gallery";

    const imgRegex = /<a[^>]*class=["'][^"']*slideshowGalleryImage[^"']*["'][^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["'](https?:\/\/[^"']+)["']/gi;
    
    const rawItems: Array<{ url: string; thumb: string }> = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const fullUrl = match[1];
      const thumbUrl = match[2];
      if (!rawItems.some(i => i.url === fullUrl)) {
        rawItems.push({ url: fullUrl, thumb: thumbUrl });
      }
    }

    if (rawItems.length === 0) {
      const altRegex = /https?:\/\/[^"']+\/galleries\/[^"']+\.(?:jpg|jpeg|png|webp)/gi;
      const found = html.match(altRegex) || [];
      found.forEach((imgUrl) => {
        if (!imgUrl.includes("/thumbs/") && !rawItems.some(i => i.url === imgUrl)) {
          const thumbUrl = imgUrl.replace(/\/galleries\/([^/]+)\/([^/]+)$/, '/galleries/$1/thumbs/$2');
          rawItems.push({ url: imgUrl, thumb: thumbUrl });
        }
      });
    }

    if (rawItems.length === 0) {
      throw new Error("No images found in this BabeSource gallery.");
    }

    const items: MediaItem[] = rawItems.map((item, index) => {
      const mediaItem: MediaItem = {
        id: `img_${index + 1}`,
        type: "image",
        url: item.url,
        thumbnail: item.thumb,
        quality: "original"
      };
      return this.processMediaItem ? this.processMediaItem(mediaItem) : mediaItem;
    });

    const coverImage = items[0]?.thumbnail || "";

    return {
      id: url.split("/").filter(Boolean).pop()?.replace(".html", "") || "babesource",
      platform: "BabeSource",
      author: {
        username: "BabeSource",
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

export const babesourceExtension = new BabeSourceExtension();

export default babesourceExtension;
