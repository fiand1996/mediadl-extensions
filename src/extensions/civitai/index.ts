import { ExtensionContext, PostResult } from "../../core/types";
import { BaseExtension } from "../../core/base";
import { civitaiManifest } from "./manifest";

export class CivitaiExtension extends BaseExtension {
  manifest = civitaiManifest;

  protected getCustomHeaders(
    url: string,
    context: ExtensionContext,
  ): Record<string, string> {
    return {
      "User-Agent": "curl/8.0.0",
      Accept: "application/json, text/plain, */*",
      Referer: "https://civitai.com/",
    };
  }

  async extract(url: string, context: ExtensionContext): Promise<PostResult> {
    const imageMatch = url.match(
      /^https?:\/\/(?:www\.)?civitai\.(?:com|red)\/images\/([0-9]+)/i,
    );

    if (!imageMatch) {
      throw new Error(`Invalid Civitai URL format: ${url}`);
    }

    const imageId = imageMatch[1];
    let items: PostResult["items"] = [];
    let authorInfo = { username: "civitai_user", avatar: "", verified: false };
    let caption = "";
    let createdAt = new Date().toISOString();

    const pageRes = await this.request(url, context);
    const htmlText = await pageRes.text();

    let targetImage: any = null;
    let postImages: any[] = [];

    const matchData = htmlText.match(
      /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/,
    );
    if (matchData) {
      try {
        const nextData = JSON.parse(matchData[1]);
        const trpcState = nextData.props.pageProps.trpcState;
        const str = JSON.stringify(trpcState);

        const searchToken = `,${imageId},`;
        let idx = str.indexOf(searchToken);
        if (idx === -1) {
          const searchTokenNum = `:${imageId},`;
          idx = str.indexOf(searchTokenNum);
        }
        if (idx === -1) {
          const searchTokenArr = `[${imageId},`;
          idx = str.indexOf(searchTokenArr);
        }

        if (idx !== -1) {
          const chunk = str.slice(idx, idx + 400);
          const uuidMatch = chunk.match(
            /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
          );
          if (uuidMatch) {
            targetImage = {
              id: Number(imageId),
              hash: uuidMatch[1],
            };
          }

          const postMatch = chunk.match(/null,([0-9]{7,10}),/);
          if (postMatch) {
            targetImage = targetImage || {};
            targetImage.postId = Number(postMatch[1]);
          }
        }
      } catch (e) {}
    }

    // Also try trpc batch / api endpoint for single image if hash is missing
    if (!targetImage || !targetImage.hash || !targetImage.postId) {
      try {
        const trpcUrl = `https://civitai.com/api/trpc/image.getById?input=${encodeURIComponent(JSON.stringify({ json: { id: Number(imageId) } }))}`;
        const trpcRes = await this.request(trpcUrl, context);
        const trpcJson = await trpcRes.json();
        const imgData = trpcJson?.result?.data?.json;
        if (imgData) {
          targetImage = {
            ...targetImage,
            ...imgData,
          };
        }
      } catch (e) {}
    }

    if (!targetImage || !targetImage.hash) {
      const apiUrl = `https://civitai.com/api/v1/images?imageIds=${imageId}`;
      const res = await this.request(apiUrl, context);
      const bodyText = await res.text();
      try {
        const resData = JSON.parse(bodyText);
        if (resData && resData.items) {
          const found = resData.items.find(
            (i: any) => String(i.id) === imageId,
          );
          if (found) {
            targetImage = found;
          }
        }
      } catch (e) {}
    }

    if (!targetImage) {
      throw new Error(`Civitai image not found or unavailable: ${imageId}`);
    }

    const postId = targetImage.postId;
    if (postId) {
      const postApiUrl = `https://civitai.com/api/v1/images?postId=${postId}`;
      const postRes = await this.request(postApiUrl, context);
      const postBodyText = await postRes.text();
      try {
        const postResData = JSON.parse(postBodyText);
        if (postResData && postResData.items && postResData.items.length > 0) {
          postImages = postResData.items;
        }
      } catch (e) {}
    }

    if (postImages.length === 0) {
      postImages = [targetImage];
    }

    for (const img of postImages) {
      let imgUrl = img.url;
      if (!imgUrl && img.hash) {
        imgUrl = `https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/${img.hash}/original=true/${img.name || "image.jpeg"}`;
      }
      if (imgUrl) {
        const thumb = imgUrl.includes("?")
          ? `${imgUrl}&width=450`
          : `${imgUrl}?width=450`;
        items.push({
          id: String(img.id || imageId),
          type: "image",
          url: imgUrl,
          thumbnail: thumb,
        });
      }
    }

    const username =
      targetImage.username ||
      targetImage.user?.username ||
      targetImage.owner?.username ||
      "civitai_user";
    authorInfo = {
      username,
      avatar: targetImage.user?.image || targetImage.owner?.image || "",
      verified: false,
    };

    if (targetImage.createdAt) {
      createdAt = new Date(targetImage.createdAt).toISOString();
    }

    const metaObj = targetImage.meta || targetImage.metadata;
    if (metaObj) {
      const parts: string[] = [];
      const prompt = metaObj.prompt;
      const negPrompt = metaObj.negativePrompt;
      const steps = metaObj.steps;
      const sampler = metaObj.sampler;
      const cfg = metaObj.cfgScale;

      if (prompt) parts.push(`Prompt: ${prompt}`);
      if (negPrompt) parts.push(`Negative Prompt: ${negPrompt}`);
      if (steps || sampler || cfg)
        parts.push(
          `Steps: ${steps || "?"}, Sampler: ${sampler || "?"}, CFG scale: ${cfg || "?"}`,
        );
      caption = parts.join("\n\n");
    }

    if (items.length === 0) {
      throw new Error(`No media items found in Civitai URL: ${url}`);
    }

    const mediaType = items.length > 1 ? "carousel" : "single_image";

    return {
      id: String(imageId),
      platform: this.manifest.name,
      author: authorInfo,
      caption,
      mediaType,
      items,
      timestamp: createdAt,
    };
  }
}

export const civitaiExtension = new CivitaiExtension();
export default civitaiExtension;
