import { ExtensionManifest } from "../../core/types";

export const babesourceManifest: ExtensionManifest = {
  id: "babesource",
  name: "BabeSource Extractor",
  version: "1.0.0",
  description: "Extracts image galleries from BabeSource.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?babesource\.com\/galleries\/([a-zA-Z0-9\-_]+)/i
  ],
  cookies: {
    support: false,
    required: false
  },
  allowedImageDomains: ["babesource.com", "media.babesource.com"],
  imageReferer: "https://www.babesource.com/"
};
