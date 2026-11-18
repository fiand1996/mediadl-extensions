import { ExtensionManifest } from "../../core/types";

export const pornpicsManifest: ExtensionManifest = {
  id: "pornpics",
  name: "PornPics Extractor",
  version: "1.0.0",
  description: "Extracts high-resolution image galleries from PornPics using FlareSolverr for Cloudflare bypass.",
  urlPatterns: [
    /https?:\/\/(?:www\.)?pornpics\.com\/galleries\/([a-zA-Z0-9\-_]+)/i
  ],
  cookies: {
    support: false,
    required: false
  },
  allowedImageDomains: ["pornpics.com", "pornpics.net", "cdni.pornpics.com"],
  imageReferer: "https://www.pornpics.com/"
};
