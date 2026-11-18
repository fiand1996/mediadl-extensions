import { ExtensionManifest } from "../../core/types";

export const twitterManifest: ExtensionManifest = {
  id: "twitter",
  name: "Twitter / X",
  version: "1.0.2",
  description: "Media extractor for Twitter/X posts and videos",
  urlPatterns: [
    /^https?:\/\/(?:(?:www|mobile)\.)?(?:twitter|x)\.com\/(?:[a-zA-Z0-9_]+\/status|i\/web\/status|statuses)\/([0-9]+)(?:\/video\/([0-9]+))?/i,
  ],
  cookies: {
    support: true,
    required: false,
    description:
      "Optional auth cookies (auth_token) for age-restricted or sensitive media",
  },
  allowedImageDomains: ["twimg.com", "x.com", "twitter.com"],
  imageReferer: "https://twitter.com/",
};
