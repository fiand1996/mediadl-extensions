import { ExtensionContext, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { twitterManifest } from "./manifest";

interface SyndicationTweetResponse {
  id_str: string;
  text: string;
  created_at: string;
  user: {
    name: string;
    screen_name: string;
    profile_image_url_https: string;
    verified?: boolean;
  };
  mediaDetails?: Array<{
    id_str: string;
    type: string;
    media_url_https: string;
    ext_alt_text?: string;
    video_info?: {
      variants: Array<{
        bitrate?: number;
        content_type: string;
        url: string;
      }>;
    };
  }>;
  photos?: Array<{
    url: string;
    alt_text?: string;
  }>;
}

export class TwitterExtension extends BaseExtension {
  manifest = twitterManifest;

  protected getCustomHeaders(
    url: string,
    context: ExtensionContext,
  ): Record<string, string> {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://twitter.com/",
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    // Match twitter/x status URL: e.g. https://twitter.com/username/status/1234567890123456789
    const match = url.match(this.manifest.urlPatterns[0]);
    if (!match) {
      throw new Error(`Invalid Twitter URL format: ${url}`);
    }

    const screenName = match[1];
    const tweetId = match[2];

    // Twitter Syndication API is a reliable, public JSON endpoint for fetching tweet details without complex OAuth
    const syndicationUrl = `https://cdn.syndication.twimg.com/tweet-url?id=${tweetId}&lang=en`;

    // Alternatively, construct the direct syndication API endpoint
    const apiUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=x`;

    const res = await this.request(apiUrl, context, {
      headers: {
        Accept: "application/json",
        Referer: `https://platform.twitter.com/embed/Tweet.html?id=${tweetId}`,
      },
    });

    const bodyText = await res.text();

    let data: SyndicationTweetResponse;
    try {
      data = JSON.parse(bodyText);
    } catch (err) {
      throw new Error(
        `Failed to parse Twitter API response: ${bodyText.slice(0, 200)}`,
      );
    }

    if (!data || !data.id_str) {
      throw new Error(`Tweet not found or unavailable: ${tweetId}`);
    }

    const items: PostResult["items"] = [];

    // Parse media details if available
    if (data.mediaDetails && data.mediaDetails.length > 0) {
      for (const media of data.mediaDetails) {
        if (media.type === "video" || media.type === "animated_gif") {
          if (media.video_info && media.video_info.variants) {
            // Filter mp4 variants and sort by bitrate descending
            const mp4Variants = media.video_info.variants
              .filter((v) => v.content_type === "video/mp4" && v.url)
              .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

            if (mp4Variants.length > 0) {
              items.push({
                id: media.id_str,
                type: "video",
                url: mp4Variants[0].url,
                thumbnail: media.media_url_https,
              });
            }
          }
        } else if (media.type === "photo") {
          items.push({
            id: media.id_str,
            type: "image",
            url: `${media.media_url_https}?name=large`,
            thumbnail: `${media.media_url_https}?name=small`,
          });
        }
      }
    }

    // Fallback if photos array exists separately
    if (items.length === 0 && data.photos && data.photos.length > 0) {
      data.photos.forEach((photo, idx) => {
        items.push({
          id: `${tweetId}_photo_${idx + 1}`,
          type: "image",
          url: `${photo.url}?name=large`,
          thumbnail: `${photo.url}?name=small`,
        });
      });
    }

    if (items.length === 0) {
      throw new Error(`No media found in tweet ${tweetId}`);
    }

    const mediaType =
      items.length > 1
        ? "carousel"
        : items[0].type === "video"
          ? "single_video"
          : "single_image";

    return {
      id: data.id_str,
      platform: this.manifest.name,
      author: {
        username: data.user.screen_name,
        avatar: data.user.profile_image_url_https,
        verified: data.user.verified || false,
      },
      caption: data.text || "",
      mediaType,
      items,
      timestamp: data.created_at
        ? new Date(data.created_at).toISOString()
        : new Date().toISOString(),
    };
  }
}

export const twitterExtension = new TwitterExtension();
export default twitterExtension;
