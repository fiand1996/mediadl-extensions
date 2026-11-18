import { ExtensionContext, PostResult, MediaItem } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { pornpicsManifest } from "./manifest";

export class PornPicsExtension extends BaseExtension {
  manifest = pornpicsManifest;

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
      throw new Error(`Failed to fetch PornPics gallery (HTTP ${response.status})`);
    }

    const html = await response.text();

    // Simple HTML parsing using regex for title and gallery items
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : "PornPics Gallery";

    // Extract high-res image links from anchor tags wrapping thumbnail images (e.g. href="https://cdni.pornpics.com/1280/...")
    // or fallback to thumb src converted to 1280
    const imgRegex = /<a[^>]*href=["'](https?:\/\/[^"']+\/(?:1280|orig)\/[^"']+)["'][^>]*>[\s\S]*?<img[^>]*src=["'](https?:\/\/[^"']+)["']/gi;
    
    const rawItems: Array<{ url: string; thumb: string }> = [];
    let match;
    while ((match = imgRegex.exec(html)) !== null) {
      const fullUrl = match[1];
      const thumbUrl = match[2];
      if (!rawItems.some(i => i.url === fullUrl)) {
        rawItems.push({ url: fullUrl, thumb: thumbUrl });
      }
    }

    // Fallback search for any 1280 images if regex didn't catch via anchor wrapper
    if (rawItems.length === 0) {
      const altRegex = /https?:\/\/[^"']+\/1280\/[^"']+\.(?:jpg|jpeg|png|webp)/gi;
      const found = html.match(altRegex) || [];
      found.forEach((imgUrl, idx) => {
        if (!rawItems.some(i => i.url === imgUrl)) {
          const thumbUrl = imgUrl.replace('/1280/', '/460/');
          rawItems.push({ url: imgUrl, thumb: thumbUrl });
        }
      });
    }

    if (rawItems.length === 0) {
      throw new Error("No images found in this PornPics gallery.");
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
      id: url.split("/").filter(Boolean).pop() || "pornpics",
      platform: "PornPics",
      author: {
        username: "PornPics",
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

export const pornpicsExtension = new PornPicsExtension();

export default pornpicsExtension;
