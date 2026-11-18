export interface MediaFormatOption {
  formatId: string;
  quality: string;
  ext: string;
  url: string;
  filesize?: number;
  note?: string;
}

export interface MediaItem {
  id: string;
  type: "video" | "image";
  url: string;
  thumbnail: string;
  quality?: string;
  duration?: string;
  formats?: MediaFormatOption[];
}

export interface PostResult {
  id: string;
  platform: string;
  author: {
    username: string;
    avatar: string;
    verified: boolean;
  };
  caption: string;
  mediaType: "single_image" | "single_video" | "carousel" | "story";
  items: MediaItem[];
  timestamp: string;
}

export interface ExtensionCookieConfig {
  support: boolean;
  required: boolean;
  description?: string;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  urlPatterns: RegExp[];
  cookies: ExtensionCookieConfig;
  allowedImageDomains?: string[];
  imageReferer?: string;
}

export interface ExtensionContext {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  getCookie?: () => Promise<string | null>;
  proxyUrl?: string;
}

export interface DownloaderExtension {
  manifest: ExtensionManifest;
  extract(url: string, context: ExtensionContext): Promise<PostResult>;
  processMediaItem?(item: MediaItem): MediaItem;
}
