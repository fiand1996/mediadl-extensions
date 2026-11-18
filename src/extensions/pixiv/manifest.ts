import { ExtensionManifest } from "../../core/types";

export const pixivManifest: ExtensionManifest = {
  id: "pixiv",
  name: "Pixiv Extractor",
  version: "1.0.0",
  description: "Extracts artwork illustrations and manga pages from Pixiv.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?pixiv\.net\/(?:en\/)?artworks\/([0-9]+)/i
  ],
  cookies: {
    support: true,
    required: false,
    description: "Optional Pixiv session cookies for age-restricted or private artworks."
  },
  allowedImageDomains: ["pximg.net", "pixiv.net"],
  imageReferer: "https://www.pixiv.net/"
};
