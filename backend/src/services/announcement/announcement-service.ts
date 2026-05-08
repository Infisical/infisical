import fs from "node:fs/promises";
import path from "node:path";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TAnnouncement, TContentfulEntriesResponse } from "./announcement-types";

const CONTENT_TYPE = "featureUpdate";
const RECENT_LIMIT = 5;
const CACHE_TTL_SECONDS = 60 * 60;
// Shorter TTL for empty results so a Contentful outage doesn't lock /recent
// into "empty" for the full hour after recovery.
const NEGATIVE_CACHE_TTL_SECONDS = 5 * 60;
// New users get a 7-day grace period before any announcements surface — avoids
// hitting them with marketing modals during onboarding.
const NEW_USER_GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

// Bundled-mode: if this file exists on disk, the backend serves announcements from it
// (and any referenced images from BUNDLED_IMAGE_DIR) instead of calling Contentful.
// Written by `scripts/bake-announcements.ts` during Docker build for self-hosted images.
export const BUNDLED_DIR = path.resolve(process.cwd(), "dist", "announcement-assets");
export const BUNDLED_JSON_PATH = path.join(BUNDLED_DIR, "announcements.json");
export const BUNDLED_IMAGE_DIR = path.join(BUNDLED_DIR, "images");

// Strip any `link` field that isn't an http(s)/mailto URL so a malicious or
// misconfigured Contentful entry can't deliver a `javascript:` href to the
// rendered <a> in the announcement modal.
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
const sanitizeLink = (link: string | null | undefined): string | null => {
  if (!link) return null;
  try {
    const { protocol } = new URL(link);
    return ALLOWED_LINK_PROTOCOLS.has(protocol) ? link : null;
  } catch {
    return null;
  }
};

type TAnnouncementServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById" | "updateById">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
};

export type TAnnouncementServiceFactory = ReturnType<typeof announcementServiceFactory>;

export const announcementServiceFactory = ({ userDAL, keyStore }: TAnnouncementServiceFactoryDep) => {
  let hasLoggedFetchError = false;
  // Single-flight promise: bundled JSON is read at most once per process lifetime,
  // and concurrent first callers await the same load (avoids a check-then-set race
  // where a request entering during the fs.readFile yield would otherwise see a
  // half-initialized `null` and fall through to Contentful).
  // To swap the bundled JSON in a self-hosted deployment, restart the backend.
  let bundlePromise: Promise<TAnnouncement[] | null> | null = null;

  const loadBundled = (): Promise<TAnnouncement[] | null> => {
    if (bundlePromise) return bundlePromise;
    bundlePromise = (async () => {
      try {
        const raw = await fs.readFile(BUNDLED_JSON_PATH, "utf8");
        const parsed = JSON.parse(raw) as TAnnouncement[];
        // Re-sanitize at load time so an older self-hosted bundle (baked before
        // the bake-time link allowlist was added) can't carry an unsafe href.
        const sanitized = parsed.map((a) => ({ ...a, link: sanitizeLink(a.link) }));
        logger.info(
          `Loaded ${sanitized.length} bundled announcement(s) from ${BUNDLED_JSON_PATH} — Contentful fetches disabled`
        );
        return sanitized;
      } catch (err) {
        const { code } = err as NodeJS.ErrnoException;
        if (code !== "ENOENT") {
          logger.warn({ err }, `Failed to read bundled announcements at ${BUNDLED_JSON_PATH}`);
        }
        return null;
      }
    })();
    return bundlePromise;
  };

  const fetchRecent = async (): Promise<TAnnouncement[]> => {
    const appCfg = getConfig();

    if (!appCfg.ANNOUNCEMENTS_ENABLED || !appCfg.CONTENTFUL_SPACE_ID || !appCfg.CONTENTFUL_DELIVERY_TOKEN) {
      return [];
    }

    const url = `https://cdn.contentful.com/spaces/${appCfg.CONTENTFUL_SPACE_ID}/environments/${appCfg.CONTENTFUL_ENVIRONMENT}/entries`;

    try {
      const { data } = await request.get<TContentfulEntriesResponse>(url, {
        params: {
          content_type: CONTENT_TYPE,
          order: "-fields.published",
          limit: RECENT_LIMIT,
          include: 1
        },
        headers: {
          Authorization: `Bearer ${appCfg.CONTENTFUL_DELIVERY_TOKEN}`
        },
        timeout: 5000
      });

      hasLoggedFetchError = false;

      const assetById = new Map<string, string>();
      for (const asset of data.includes?.Asset ?? []) {
        const fileUrl = asset.fields?.file?.url;
        if (fileUrl) {
          assetById.set(asset.sys.id, fileUrl.startsWith("//") ? `https:${fileUrl}` : fileUrl);
        }
      }

      return data.items.flatMap<TAnnouncement>((entry) => {
        if (!entry?.fields?.title || !entry.fields.body || !entry.fields.published) return [];

        const imageAssetId = entry.fields.image?.sys?.id;
        const imageUrl = imageAssetId ? (assetById.get(imageAssetId) ?? null) : null;

        return [
          {
            id: entry.sys.id,
            title: entry.fields.title,
            body: entry.fields.body,
            imageUrl,
            link: sanitizeLink(entry.fields.link),
            linkLabel: entry.fields.linkLabel ?? null,
            published: entry.fields.published
          }
        ];
      });
    } catch (err) {
      // Returning [] (instead of throwing) lets withCache write a negative entry,
      // so a Contentful outage doesn't trigger a fresh 4-attempt axios-retry burst
      // on every /recent request for the duration of the outage.
      if (!hasLoggedFetchError) {
        logger.warn(
          { err },
          "Failed to fetch announcements — returning empty list (will retry after negative-cache TTL)"
        );
        hasLoggedFetchError = true;
      }
      return [];
    }
  };

  const getAnnouncements = async (): Promise<TAnnouncement[]> => {
    const appCfg = getConfig();
    if (!appCfg.ANNOUNCEMENTS_ENABLED) return [];

    const fromBundle = await loadBundled();
    if (fromBundle) return fromBundle.slice(0, RECENT_LIMIT);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.RecentAnnouncements,
      ttlSeconds: (result) => (result.length === 0 ? NEGATIVE_CACHE_TTL_SECONDS : CACHE_TTL_SECONDS),
      fetcher: fetchRecent
    });
  };

  const listRecentAnnouncements = async ({
    userId
  }: {
    userId: string;
  }): Promise<{ announcements: TAnnouncement[]; lastSeenAnnouncementId: string | null }> => {
    const user = await userDAL.findById(userId);
    const lastSeenAnnouncementId = user?.lastSeenAnnouncementId ?? null;

    if (user?.createdAt && Date.now() - new Date(user.createdAt).getTime() < NEW_USER_GRACE_PERIOD_MS) {
      return { announcements: [], lastSeenAnnouncementId };
    }

    const announcements = await getAnnouncements();
    return { announcements, lastSeenAnnouncementId };
  };

  const markAnnouncementSeen = async ({ userId, announcementId }: { userId: string; announcementId: string }) => {
    const user = await userDAL.updateById(userId, { lastSeenAnnouncementId: announcementId });
    if (!user) throw new NotFoundError({ message: "User not found" });
    return { lastSeenAnnouncementId: user.lastSeenAnnouncementId ?? null };
  };

  return {
    listRecentAnnouncements,
    markAnnouncementSeen
  };
};
