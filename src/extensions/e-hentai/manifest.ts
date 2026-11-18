import { ExtensionManifest } from "../../core/types";

export const eHentaiManifest: ExtensionManifest = {
  id: "e-hentai",
  name: "E-Hentai Extractor",
  version: "1.0.0",
  description: "Extracts galleries from e-hentai.org.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?(?:e-hentai|exhentai)\.org\/g\/([0-9]+)\/([a-zA-Z0-9]+)/i
  ],
  cookies: {
    support: true,
    required: false,
    description: "Optional e-hentai / exhentai member cookies (ipb_member_id, ipb_pass_hash) for restricted galleries."
  },
  allowedImageDomains: ["e-hentai.org", "exhentai.org", "ehgt.org", "hath.network"],
  imageReferer: "https://e-hentai.org/"
};
