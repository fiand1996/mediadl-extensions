import { ExtensionContext, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { instagramManifest } from "./manifest";

function decodeShortcode(shortcode: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let id = BigInt(0);
  for (let i = 0; i < shortcode.length; i++) {
    id = (id * BigInt(64)) + BigInt(alphabet.indexOf(shortcode[i]));
  }
  return id.toString();
}

export class InstagramExtension extends BaseExtension {
  manifest = instagramManifest;

  protected getCustomHeaders(url: string, context: ExtensionContext): Record<string, string> {
    return {
      "User-Agent": "Instagram 290.0.0.21.111 (iPhone14,3; iOS 16_6; sv_SE; scale=3.00; 1170x2532; 498305367)",
      "Accept": "*/*",
      "Accept-Language": "en,en-US;q=0.9,id;q=0.8",
      "X-IG-App-ID": "936619743392459",
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const storyMatch = url.match(/\/stories\/(?:highlights\/|[^/?#]+\/)([0-9]+)/i);
    const postMatch = url.match(/(?:\/(?:p|reels?|tv)\/|share\/(?:p|reel)\/)([^/?#]+)/i);

    let mediaId: string;
    if (storyMatch) {
      mediaId = storyMatch[1];
    } else if (postMatch) {
      mediaId = decodeShortcode(postMatch[1]);
    } else {
      throw new Error("Invalid Instagram URL format");
    }

    const apiUrl = `https://i.instagram.com/api/v1/media/${mediaId}/info/`;

    // Use abstracted request method from BaseExtension
    const response = await this.request(apiUrl, context);

    if (!response.ok) {
      throw new Error(`Instagram Mobile API responded with status ${response.status}`);
    }

    const rawText = await response.text();
    const cleanText = rawText.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    const data = JSON.parse(cleanText);

    if (!data.items || data.items.length === 0) {
      throw new Error("Media items not found in API response.");
    }

    const mediaItem = data.items[0];
    const isCarousel = Boolean(mediaItem.carousel_media && mediaItem.carousel_media.length > 0);
    const isVideo = mediaItem.media_type === 2 || Boolean(mediaItem.video_versions);

    let items: Array<{ id: string; type: "video" | "image"; url: string; thumbnail: string }> = [];

    if (isCarousel) {
      items = mediaItem.carousel_media.map((c: any) => {
        const cIsVideo = c.media_type === 2 || Boolean(c.video_versions);
        const mediaUrl = cIsVideo 
          ? c.video_versions?.[0]?.url 
          : (c.image_versions2?.candidates?.[0]?.url || c.display_url);
        const thumb = c.image_versions2?.candidates?.[0]?.url || "";

        return {
          id: c.id || Math.random().toString(),
          type: cIsVideo ? "video" : "image",
          url: mediaUrl,
          thumbnail: thumb,
        };
      });
    } else {
      const mediaUrl = isVideo
        ? mediaItem.video_versions?.[0]?.url
        : (mediaItem.image_versions2?.candidates?.[0]?.url || mediaItem.display_url);
      const thumb = mediaItem.image_versions2?.candidates?.[0]?.url || "";

      items.push({
        id: mediaItem.id || "single",
        type: isVideo ? "video" : "image",
        url: mediaUrl,
        thumbnail: thumb,
      });
    }

    return {
      id: mediaItem.id,
      platform: "Instagram",
      author: {
        username: mediaItem.user?.username || "instagram_user",
        avatar: mediaItem.user?.profile_pic_url || "",
        verified: mediaItem.user?.is_verified || false,
      },
      caption: mediaItem.caption?.text || "",
      mediaType: isCarousel ? "carousel" : (isVideo ? "single_video" : "single_image"),
      items,
      timestamp: new Date().toISOString(),
    };
  }
}

export const instagramExtension = new InstagramExtension();

export default instagramExtension;
