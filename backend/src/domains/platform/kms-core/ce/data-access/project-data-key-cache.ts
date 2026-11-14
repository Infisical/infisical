import { ExternalSystemError } from "@app/domains/lib/errors";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { delay } from "@app/lib/delay";
import { logger } from "@app/lib/logger";

import { EncryptedDataKey } from "../models/encrypted-data-key";
import { TProjectDataKeyCache } from "../services/dependencies";

// The key, TTL and payload are frozen: pods of the previous release read and write the same entries during a deploy.
export const projectDataKeyCacheKey = (projectId: string) => `kms-project-sm-material:${projectId}`;
export const PROJECT_DATA_KEY_CACHE_TTL_SECONDS = 5 * 60;

const EVICT_ATTEMPTS = 3;

export class ProjectDataKeyCache implements TProjectDataKeyCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async get(projectId: string): Promise<EncryptedDataKey | null> {
    try {
      const raw = await this.keyStore.getItem(projectDataKeyCacheKey(projectId));
      if (!raw) return null;
      return EncryptedDataKey.fromCacheJSON(JSON.parse(raw) as Parameters<typeof EncryptedDataKey.fromCacheJSON>[0]);
    } catch (err) {
      logger.warn({ err, projectId }, `KMS: project data key cache read failed [projectId=${projectId}]`);
      return null;
    }
  }

  async set(projectId: string, key: EncryptedDataKey): Promise<void> {
    try {
      await this.keyStore.setItemWithExpiry(
        projectDataKeyCacheKey(projectId),
        PROJECT_DATA_KEY_CACHE_TTL_SECONDS,
        JSON.stringify(key.toCacheJSON())
      );
    } catch (err) {
      logger.warn({ err, projectId }, `KMS: project data key cache write failed [projectId=${projectId}]`);
    }
  }

  async evict(projectId: string): Promise<void> {
    for (let attempt = 1; attempt <= EVICT_ATTEMPTS; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.keyStore.deleteItem(projectDataKeyCacheKey(projectId));
        return;
      } catch (err) {
        if (attempt === EVICT_ATTEMPTS) {
          throw new ExternalSystemError({
            message: "Failed to clear the project's cached KMS key. Retry the request.",
            cause: err
          });
        }
        // eslint-disable-next-line no-await-in-loop
        await delay(100 * attempt);
      }
    }
  }
}
