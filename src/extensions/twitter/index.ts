import { ExtensionContext, MediaItem, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { twitterManifest } from "./manifest";

interface TwitterUser {
  name?: string;
  screen_name?: string;
  profile_image_url_https?: string;
  verified?: boolean;
}

interface TwitterVariant {
  bitrate?: number;
  content_type?: string;
  url?: string;
}

interface TwitterMedia {
  id_str?: string;
  id?: string | number;
  type?: string;
  media_url_https?: string;
  media_url?: string;
  ext_alt_text?: string;
  sizes?: Record<string, { w?: number; h?: number }>;
  original_info?: { width?: number; height?: number };
  video_info?: {
    duration_millis?: number;
    variants?: TwitterVariant[];
  };
}

interface TwitterStatus {
  id_str?: string;
  full_text?: string;
  text?: string;
  created_at?: string;
  user?: TwitterUser;
  extended_entities?: { media?: TwitterMedia[] };
  entities?: { media?: TwitterMedia[]; hashtags?: Array<{ text?: string }> };
  mediaDetails?: TwitterMedia[];
  quoted_status?: TwitterStatus;
  quoted_tweet?: TwitterStatus;
  retweeted_status?: TwitterStatus;
  [key: string]: unknown;
}

class TwitterApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TwitterApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStatus(value: unknown): TwitterStatus | undefined {
  return isRecord(value) ? (value as TwitterStatus) : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function updateImageName(url: string | undefined, name: string): string {
  if (!url) return "";
  const parsed = new URL(url);
  parsed.searchParams.set("name", name);
  return parsed.toString();
}

export class TwitterExtension extends BaseExtension {
  manifest = twitterManifest;

  private static readonly API_BASE = "https://api.x.com/1.1/";
  private static readonly GRAPHQL_API_BASE = "https://x.com/i/api/graphql/";
  private static readonly GRAPHQL_ENDPOINT =
    "2ICDjqPd81tulZcYrtpTuQ/TweetResultByRestId";
  private static readonly BEARER_TOKEN =
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

  protected getCustomHeaders(): Record<string, string> {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://twitter.com/",
    };
  }

  private async getApiAuthHeaders(
    tweetId: string,
    context: ExtensionContext,
  ): Promise<Record<string, string>> {
    const cookieText = (await context.getCookie?.()) || "";
    const cookies: Record<string, string> = {};
    let hasNetscapeCookies = false;

    for (const rawLine of cookieText.split(/\r?\n/)) {
      const line = rawLine.startsWith("#HttpOnly_")
        ? rawLine.slice("#HttpOnly_".length)
        : rawLine;
      if (!line || line.startsWith("#")) continue;
      const fields = line.split("\t");
      if (fields.length >= 7) {
        hasNetscapeCookies = true;
        cookies[fields[5]] = fields[6];
      }
    }

    if (!hasNetscapeCookies) {
      for (const part of cookieText.split(";")) {
        const separator = part.indexOf("=");
        if (separator > 0) {
          cookies[part.slice(0, separator).trim()] = part
            .slice(separator + 1)
            .trim();
        }
      }
    }

    const headers: Record<string, string> = {};
    if (cookies.auth_token) {
      headers["x-twitter-auth-type"] = "OAuth2Session";
      headers["x-twitter-active-user"] = "yes";
      headers["x-twitter-client-language"] = "en";
      if (cookies.ct0) headers["x-csrf-token"] = cookies.ct0;
    } else {
      headers["x-guest-token"] = await this.fetchGuestToken(tweetId, context);
    }

    if (!hasNetscapeCookies && cookieText.trim()) {
      headers.Cookie = cookieText.trim();
    }
    return headers;
  }

  private async requestJson(
    url: string,
    context: ExtensionContext,
    options: RequestInit,
    description: string,
  ): Promise<unknown> {
    const response = await this.request(url, context, options);
    if (!response.ok) {
      throw new TwitterApiError(
        `${description} failed with HTTP ${response.status}`,
        response.status,
      );
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(
        `${description} returned invalid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async fetchGuestToken(
    tweetId: string,
    context: ExtensionContext,
  ): Promise<string> {
    const cookieText = (await context.getCookie?.()) || "";
    const response = await this.requestJson(
      `${TwitterExtension.API_BASE}guest/activate.json`,
      context,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TwitterExtension.BEARER_TOKEN}`,
          ...(!cookieText.includes("\t") && cookieText.trim()
            ? { Cookie: cookieText.trim() }
            : {}),
        },
        body: "",
      },
      "Twitter guest-token request",
    );
    const token = isRecord(response) ? asString(response.guest_token) : undefined;
    if (!token) {
      throw new Error(`Twitter did not return a guest token for tweet ${tweetId}`);
    }
    return token;
  }

  private buildGraphqlQuery(tweetId: string): Record<string, unknown> {
    return {
      variables: {
        tweetId,
        withCommunity: false,
        includePromotedContent: false,
        withVoice: false,
      },
      features: {
        creator_subscriptions_tweet_preview_api_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: false,
        tweet_awards_web_tipping_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        responsive_web_media_download_video_enabled: false,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false,
      },
      fieldToggles: { withArticleRichContentState: false },
    };
  }

  private async fetchGraphqlStatus(
    tweetId: string,
    context: ExtensionContext,
  ): Promise<TwitterStatus> {
    const authHeaders = await this.getApiAuthHeaders(tweetId, context);
    const query = this.buildGraphqlQuery(tweetId);
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      params.set(key, JSON.stringify(value));
    }

    const response = await this.requestJson(
      `${TwitterExtension.GRAPHQL_API_BASE}${TwitterExtension.GRAPHQL_ENDPOINT}?${params}`,
      context,
      {
        headers: {
          Authorization: `Bearer ${TwitterExtension.BEARER_TOKEN}`,
          ...authHeaders,
        },
      },
      "Twitter GraphQL request",
    );
    const root = isRecord(response) ? response : {};
    const errors = Array.isArray(root.errors)
      ? root.errors
          .map((error) =>
            isRecord(error) ? asString(error.message) : undefined,
          )
          .filter((message): message is string => Boolean(message))
      : [];
    const meaningfulErrors = errors.filter(
      (message) => message.toLowerCase() !== "dependency: unspecified",
    );
    if (meaningfulErrors.length > 0) {
      throw new Error(
        `Twitter GraphQL error: ${[...new Set(meaningfulErrors)].join(", ")}`,
      );
    }

    const tweetResult = isRecord(root.data) && isRecord(root.data.tweetResult)
      ? asStatus(root.data.tweetResult.result)
      : undefined;
    if (!tweetResult) {
      throw new Error(`Twitter GraphQL returned no result for tweet ${tweetId}`);
    }

    if (tweetResult.__typename === "TweetWithVisibilityResults") {
      const wrapped = asStatus(tweetResult.tweet);
      if (wrapped) return this.graphqlResultToStatus(wrapped, tweetId);
    }
    if (tweetResult.tombstone) {
      const tombstone = asStatus(tweetResult.tombstone);
      const message =
        tombstone && isRecord(tombstone.text)
          ? asString(tombstone.text.text)
          : undefined;
      throw new Error(`Twitter says: ${message || "tweet is unavailable"}`);
    }
    if (tweetResult.__typename === "TweetUnavailable") {
      const reason = asString(tweetResult.reason);
      throw new Error(reason || `Tweet ${tweetId} is unavailable`);
    }
    return this.graphqlResultToStatus(tweetResult, tweetId);
  }

  private graphqlResultToStatus(
    result: TwitterStatus,
    tweetId: string,
  ): TwitterStatus {
    const status = asStatus(result.legacy);
    if (!status) {
      throw new Error(`Twitter GraphQL returned incomplete tweet ${tweetId}`);
    }

    const core = asStatus(result.core);
    const userResults = core && asStatus(core.user_results);
    const userResult = userResults && asStatus(userResults.result);
    const user = userResult && asStatus(userResult.legacy);
    if (user) status.user = user as TwitterUser;

    const quotedResults = asStatus(result.quoted_status_result);
    const quotedResult = quotedResults && asStatus(quotedResults.result);
    if (quotedResult) {
      const quotedLegacy = asStatus(quotedResult.legacy);
      if (quotedLegacy) {
        const quotedCore = asStatus(quotedResult.core);
        const quotedUserResults = quotedCore && asStatus(quotedCore.user_results);
        const quotedUserResult =
          quotedUserResults && asStatus(quotedUserResults.result);
        const quotedUser =
          quotedUserResult && asStatus(quotedUserResult.legacy);
        if (quotedUser) quotedLegacy.user = quotedUser as TwitterUser;
        status.quoted_status = quotedLegacy as TwitterStatus;
      }
    }

    const retweetedResults = asStatus(status.retweeted_status_result);
    const retweetedResult = retweetedResults && asStatus(retweetedResults.result);
    const retweetedLegacy = retweetedResult && asStatus(retweetedResult.legacy);
    if (retweetedLegacy) {
      const retweetedCore = asStatus(retweetedResult.core);
      const retweetedUserResults =
        retweetedCore && asStatus(retweetedCore.user_results);
      const retweetedUserResult =
        retweetedUserResults && asStatus(retweetedUserResults.result);
      const retweetedUser =
        retweetedUserResult && asStatus(retweetedUserResult.legacy);
      if (retweetedUser) retweetedLegacy.user = retweetedUser as TwitterUser;
      status.retweeted_status = retweetedLegacy as TwitterStatus;
    }

    const views = asStatus(result.views);
    if (views && views.count !== undefined) status.view_count = views.count;
    return status;
  }

  private generateSyndicationToken(tweetId: string): string {
    // Keep the same Number/base-36 conversion as yt-dlp's syndication token.
    return (((Number(tweetId) / 1e15) * Math.PI)
      .toString(36)
      .replace(/(0+|\.)/g, ""));
  }

  private async fetchSyndicationStatus(
    tweetId: string,
    context: ExtensionContext,
  ): Promise<TwitterStatus> {
    const params = new URLSearchParams({
      id: tweetId,
      token: this.generateSyndicationToken(tweetId),
    });
    const response = await this.requestJson(
      `https://cdn.syndication.twimg.com/tweet-result?${params}`,
      context,
      { headers: { "User-Agent": "Googlebot" } },
      "Twitter syndication request",
    );
    const status = asStatus(response);
    if (!status) {
      throw new Error(`Twitter syndication returned no tweet for ${tweetId}`);
    }

    const quoted = asStatus(status.quoted_tweet);
    if (quoted) status.quoted_status = quoted;
    return status;
  }

  private async fetchStatus(
    tweetId: string,
    context: ExtensionContext,
  ): Promise<TwitterStatus> {
    try {
      return await this.fetchGraphqlStatus(tweetId, context);
    } catch (error) {
      if (!(error instanceof TwitterApiError) || error.status !== 429) {
        throw error;
      }
      return this.fetchSyndicationStatus(tweetId, context);
    }
  }

  private getMedia(status: TwitterStatus): TwitterMedia[] {
    const media =
      status.extended_entities?.media || status.entities?.media || status.mediaDetails;
    return Array.isArray(media) ? media : [];
  }

  private mediaItem(media: TwitterMedia, fallbackId: string): MediaItem | undefined {
    const type = media.type;
    const mediaId = String(media.id_str ?? media.id ?? fallbackId);
    if (type === "photo") {
      const url = media.media_url_https || media.media_url;
      if (!url) return undefined;
      return {
        id: mediaId,
        type: "image",
        url: updateImageName(url, "orig"),
        thumbnail: updateImageName(url, "small"),
      };
    }
    if (type !== "video" && type !== "animated_gif") return undefined;

    const variants = (media.video_info?.variants || [])
      .filter((variant) => Boolean(variant.url))
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const formats = variants.flatMap((variant, index) => {
      if (!variant.url) return [];
      const isHls = variant.content_type?.toLowerCase().includes("mpegurl") ||
        variant.url?.includes(".m3u8");
      const bitrate = variant.bitrate;
      const quality = bitrate
        ? `${Math.round(bitrate / 1000)} kbps`
        : isHls
          ? "HLS"
          : "standard";
      return [{
        formatId: `${isHls ? "hls" : "http"}-${bitrate || index}`,
        quality,
        ext: isHls ? "m3u8" : "mp4",
        url: variant.url,
      }];
    });
    const primaryFormat =
      formats.find((format) => format.ext === "mp4") || formats[0];
    if (!primaryFormat) return undefined;

    const thumbnailUrl = media.media_url_https || media.media_url;
    const durationMillis = media.video_info?.duration_millis;
    return {
      id: mediaId,
      type: "video",
      url: primaryFormat.url,
      thumbnail: updateImageName(thumbnailUrl, "orig"),
      ...(durationMillis !== undefined
        ? { duration: String(durationMillis / 1000) }
        : {}),
      formats: [primaryFormat],
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const match = url.match(this.manifest.urlPatterns[0]);
    if (!match) {
      throw new Error(`Invalid Twitter URL format: ${url}`);
    }
    const tweetId = match[1];
    const selectedVideoIndex = match[2] ? Number(match[2]) : undefined;
    const status = await this.fetchStatus(tweetId, context);
    const originalStatus = status.retweeted_status || status;
    const sources = [originalStatus, originalStatus.quoted_status].filter(
      (source): source is TwitterStatus => Boolean(source),
    );
    let items = sources.flatMap((source, sourceIndex) =>
      this.getMedia(source).flatMap((media, mediaIndex) => {
        const item = this.mediaItem(
          media,
          `${source.id_str || tweetId}_${sourceIndex}_${mediaIndex}`,
        );
        return item ? [item] : [];
      }),
    );
    if (selectedVideoIndex !== undefined) {
      const videos = items.filter((item) => item.type === "video");
      const selectedVideo = videos[selectedVideoIndex - 1];
      if (!selectedVideo) {
        throw new Error(
          `Video #${selectedVideoIndex} is unavailable in tweet ${tweetId}`,
        );
      }
      items = [selectedVideo];
    }
    if (items.length === 0) {
      throw new Error(`No image or video media found in tweet ${tweetId}`);
    }

    const user = originalStatus.user || status.user || {};
    const timestamp = originalStatus.created_at || status.created_at;
    const parsedTimestamp = timestamp ? new Date(timestamp) : undefined;
    if (!parsedTimestamp || !Number.isFinite(parsedTimestamp.getTime())) {
      throw new Error(`Twitter returned no valid creation time for tweet ${tweetId}`);
    }

    return {
      id: originalStatus.id_str || status.id_str || tweetId,
      platform: this.manifest.name,
      author: {
        username: user.screen_name || "",
        avatar: user.profile_image_url_https || "",
        verified: user.verified || false,
      },
      caption: (originalStatus.full_text || originalStatus.text || "").trim(),
      mediaType:
        items.length > 1
          ? "carousel"
          : items[0].type === "video"
            ? "single_video"
            : "single_image",
      items,
      timestamp: parsedTimestamp.toISOString(),
    };
  }
}

export const twitterExtension = new TwitterExtension();
export default twitterExtension;
