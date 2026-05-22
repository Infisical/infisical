/* eslint-disable */
//
// Bakes the latest Contentful announcements into a static JSON file plus local image
// assets, for use by self-hosted / air-gapped deployments. Output:
//   dist/announcement-assets/announcements.json
//   dist/announcement-assets/images/<sha>.<ext>
//
// Image URLs in the JSON are rewritten to /api/v1/announcement/assets/<filename>
// so the backend can serve them locally without any outbound calls at runtime.
//
// Run during Docker build for self-hosted images. Skips silently if Contentful
// credentials are not provided (cloud builds, dev builds).
//
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const SPACE = process.env.CONTENTFUL_SPACE_ID;
const TOKEN = process.env.CONTENTFUL_DELIVERY_TOKEN;
const ENV = process.env.CONTENTFUL_ENVIRONMENT || "master";
const CONTENT_TYPE = "featureUpdate";
const BAKE_LIMIT = Number(process.env.BAKE_ANNOUNCEMENTS_LIMIT || "5");
const OUT_DIR = path.resolve(process.cwd(), "dist", "announcement-assets");
const IMAGE_DIR = path.join(OUT_DIR, "images");
const JSON_PATH = path.join(OUT_DIR, "announcements.json");

// SVG is intentionally excluded — same-origin SVG can carry inline <script> and
// would execute in the app origin if a user navigates to the asset URL directly.
const ALLOWED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
// Contentful's image CDN. Anything else means a misconfigured/tampered entry
// — refuse rather than embed unknown bytes in self-hosted images.
const ALLOWED_IMAGE_HOSTS = new Set(["images.ctfassets.net"]);

const sanitizeLink = (link: string | null | undefined): string | null => {
  if (!link) return null;
  try {
    const { protocol } = new URL(link);
    return ALLOWED_LINK_PROTOCOLS.has(protocol) ? link : null;
  } catch {
    return null;
  }
};

type ContentfulAsset = {
  sys: { id: string };
  fields: { file?: { url?: string; contentType?: string } };
};

type ContentfulEntry = {
  sys: { id: string };
  fields: {
    title?: string;
    body?: string;
    image?: { sys: { id: string } };
    link?: string;
    linkLabel?: string;
    published?: string;
  };
};

type ContentfulResponse = {
  items: ContentfulEntry[];
  includes?: { Asset?: ContentfulAsset[] };
};

async function downloadAsset(
  url: string,
  assetId: string,
  contentType: string | undefined
): Promise<{ filename: string; bytes: number } | null> {
  const parsed = new URL(url);
  if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) {
    console.warn(`[bake-announcements] skipping ${url}: host ${parsed.hostname} not allowed`);
    return null;
  }
  const ext = path.extname(parsed.pathname).toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    console.warn(`[bake-announcements] skipping ${url}: extension ${ext || "(none)"} not allowed`);
    return null;
  }
  if (contentType && !ALLOWED_IMAGE_MIMES.has(contentType.toLowerCase())) {
    console.warn(`[bake-announcements] skipping ${url}: content-type ${contentType} not allowed`);
    return null;
  }
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[bake-announcements] failed to download ${url}: ${res.status}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
  const filename = `${hash}${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, filename), buf);
  console.log(`[bake-announcements]   asset ${assetId} -> ${filename} (${buf.length} bytes)`);
  return { filename, bytes: buf.length };
}

async function main() {
  if (!SPACE || !TOKEN) {
    console.warn(
      "[bake-announcements] CONTENTFUL_SPACE_ID or CONTENTFUL_DELIVERY_TOKEN not set — skipping bake. Backend will fetch live at runtime."
    );
    return;
  }

  const url = new URL(`https://cdn.contentful.com/spaces/${SPACE}/environments/${ENV}/entries`);
  url.searchParams.set("content_type", CONTENT_TYPE);
  url.searchParams.set("order", "-fields.published");
  url.searchParams.set("limit", String(BAKE_LIMIT));
  url.searchParams.set("include", "1");

  console.log(`[bake-announcements] fetching ${url.toString()}`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    throw new Error(`Contentful fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as ContentfulResponse;

  await fs.mkdir(IMAGE_DIR, { recursive: true });

  const assetMap = new Map<string, { url: string; contentType: string | undefined }>();
  for (const asset of data.includes?.Asset ?? []) {
    const remoteUrl = asset.fields?.file?.url;
    if (!remoteUrl) continue;
    assetMap.set(asset.sys.id, {
      url: remoteUrl.startsWith("//") ? `https:${remoteUrl}` : remoteUrl,
      contentType: asset.fields?.file?.contentType
    });
  }

  const downloaded = new Map<string, string>(); // assetId -> local filename
  await Promise.all(
    Array.from(assetMap, async ([assetId, { url: remoteUrl, contentType }]) => {
      const result = await downloadAsset(remoteUrl, assetId, contentType);
      if (result) downloaded.set(assetId, result.filename);
    })
  );

  const announcements = data.items.flatMap((entry) => {
    if (!entry?.fields?.title || !entry.fields.body || !entry.fields.published) return [];
    const imageId = entry.fields.image?.sys?.id;
    const filename = imageId ? downloaded.get(imageId) : null;
    return [
      {
        id: entry.sys.id,
        title: entry.fields.title,
        body: entry.fields.body,
        imageUrl: filename ? `/api/v1/announcement/assets/${filename}` : null,
        link: sanitizeLink(entry.fields.link),
        linkLabel: entry.fields.linkLabel ?? null,
        published: entry.fields.published
      }
    ];
  });

  await fs.writeFile(JSON_PATH, `${JSON.stringify(announcements, null, 2)}\n`);
  console.log(
    `[bake-announcements] wrote ${announcements.length} announcement(s) and ${downloaded.size} image(s) to ${OUT_DIR}`
  );
}

main().catch((err) => {
  console.error("[bake-announcements] failed:", err);
  process.exit(1);
});
