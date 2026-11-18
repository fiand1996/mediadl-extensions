import { ExtensionManifest } from "../../core/types";

export const threeHentaiManifest: ExtensionManifest = {
  id: "3hentai",
  name: "3Hentai Extractor",
  version: "1.0.0",
  description: "Extracts galleries from 3hentai.net.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?3hentai\.net\/d\/([0-9]+)/i
  ],
  cookies: {
    support: false,
    required: false,
    description: "No cookies required for 3hentai."
  },
  allowedImageDomains: ["3hentai.net", "cdn.3hentai.net"],
  imageReferer: "https://3hentai.net/"
};
