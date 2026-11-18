import { ExtensionManifest } from "../../core/types";

export const cosplayteleManifest: ExtensionManifest = {
  id: "cosplaytele",
  name: "CosplayTele Extractor",
  version: "1.0.0",
  description: "Extracts galleries from cosplaytele.com.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?cosplaytele\.com\/[a-zA-Z0-9\-_]+\/?/i
  ],
  cookies: {
    support: false,
    required: false,
    description: "No cookies required for CosplayTele."
  },
  allowedImageDomains: ["cosplaytele.com"],
  imageReferer: "https://cosplaytele.com/"
};
