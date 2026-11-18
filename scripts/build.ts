import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as esbuild from "esbuild";

interface RepoExtensionEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  urlPatterns: string[];
  cookies: {
    support: boolean;
    required: boolean;
    description?: string;
  };
  allowedImageDomains?: string[];
  imageReferer?: string;
  bundleFile: string;
  sha256: string;
  size: number;
  updatedAt: string;
}

interface RepoIndex {
  version: number;
  generatedAt: string;
  count: number;
  extensions: RepoExtensionEntry[];
}

async function main() {
  const rootDir = path.resolve(__dirname, "..");
  const srcExtensionsDir = path.join(rootDir, "src", "extensions");
  const distDir = path.join(rootDir, "dist");

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const entries: RepoExtensionEntry[] = [];
  const dirs = fs.readdirSync(srcExtensionsDir);

  console.log(`🚀 Building extensions from: ${srcExtensionsDir}`);

  for (const dir of dirs) {
    const extDir = path.join(srcExtensionsDir, dir);
    if (!fs.statSync(extDir).isDirectory()) continue;

    const indexPath = path.join(extDir, "index.ts");
    if (!fs.existsSync(indexPath)) {
      console.warn(`⚠️ Skipping ${dir}: index.ts not found.`);
      continue;
    }

    try {
      // 1. Dynamically import the extension module using tsx runtime
      const mod = await import(indexPath);
      const instance = mod.default || mod[`${dir}Extension`] || Object.values(mod)[0];

      if (!instance || !instance.manifest) {
        console.warn(`⚠️ Skipping ${dir}: No valid DownloaderExtension instance exported.`);
        continue;
      }

      const manifest = instance.manifest;
      const bundleFileName = `${manifest.id}.js`;
      const bundleOutPath = path.join(distDir, bundleFileName);

      // 2. Bundle with esbuild into a self-contained CommonJS bundle
      await esbuild.build({
        entryPoints: [indexPath],
        outfile: bundleOutPath,
        bundle: true,
        platform: "node",
        target: "node18",
        format: "cjs",
        sourcemap: false,
        minify: true,
        banner: {
          js: `/* MediaDL Extension: ${manifest.name} v${manifest.version} */\n`,
        },
      });

      // 3. Compute hash and file size
      const bundleContent = fs.readFileSync(bundleOutPath);
      const sha256 = crypto.createHash("sha256").update(bundleContent).digest("hex");
      const size = bundleContent.length;

      entries.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        urlPatterns: manifest.urlPatterns.map((p: RegExp) => p.source),
        cookies: manifest.cookies,
        allowedImageDomains: manifest.allowedImageDomains,
        imageReferer: manifest.imageReferer,
        bundleFile: bundleFileName,
        sha256,
        size,
        updatedAt: new Date().toISOString(),
      });

      console.log(`✅ [${manifest.id}] v${manifest.version} (${(size / 1024).toFixed(1)} KB) built successfully.`);
    } catch (err) {
      console.error(`❌ Failed to build extension "${dir}":`, err);
    }
  }

  // 4. Generate index.json repository manifest
  const repoIndex: RepoIndex = {
    version: 1,
    generatedAt: new Date().toISOString(),
    count: entries.length,
    extensions: entries,
  };

  const indexJsonPath = path.join(distDir, "index.json");
  fs.writeFileSync(indexJsonPath, JSON.stringify(repoIndex, null, 2), "utf8");
  console.log(`\n🎉 Repository manifest generated at: ${indexJsonPath} with ${entries.length} extensions.`);
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
