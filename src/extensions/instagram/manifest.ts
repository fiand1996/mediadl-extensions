import { ExtensionManifest } from "../../core/types";

export const instagramManifest: ExtensionManifest = {
  id: "instagram",
  name: "Instagram Extractor",
  version: "1.0.0",
  description: "Extracts posts, reels, stories, and carousels from Instagram using custom mobile API requests.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?instagram\.com\/(?:[^\/]+\/)?(?:p|reels?|tv)\/([^/?#]+)/i,
    /https?:\/\/(?:www\.)?instagram\.com\/stories\/(?:highlights\/|[^/?#]+\/)([0-9]+)/i,
    /https?:\/\/(?:www\.)?instagram\.com\/share\/(?:p|reel)\/([^/?#]+)/i,
  ],
  cookies: {
    support: true,
    required: false,
    description: "Requires active Instagram session cookies to bypass login wall and fetch carousels/videos."
  },
  allowedImageDomains: ["fbcdn.net", "instagram.com"],
  imageReferer: "https://www.instagram.com/"
};
