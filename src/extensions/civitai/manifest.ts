import { ExtensionManifest } from "../../core/types";

export const civitaiManifest: ExtensionManifest = {
  id: "civitai",
  name: "Civitai",
  version: "1.0.0",
  description: "Media extractor for Civitai images",
  urlPatterns: [
    /^https?:\/\/(?:www\.)?civitai\.(?:com|red)\/images\/([0-9]+)/i,
  ],
  cookies: {
    support: true,
    required: false,
    description: "Optional session cookies for NSFW or restricted images",
  },
  allowedImageDomains: [
    "civitai.com",
    "civitai.red",
    "image.civitai.com",
    "getimg.ai",
    "givitai.com",
  ],
  imageReferer: "https://civitai.com/",
};
