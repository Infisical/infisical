import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { logger } from "@app/lib/logger";

import { InstanceConfig, TInstanceConfigRecord } from "../models/instance-config";
import { TInstanceConfigCache } from "../services/dependencies";

// Frozen key, TTL and value shape: pods of the previous release read and write the same entry during a rolling
// deploy, and their Slack code decrypts the encrypted columns straight from the cached row. So the full row is
// cached, ciphertext included.
const INSTANCE_CONFIG_CACHE_KEY = "infisical-admin-cfg";
const INSTANCE_CONFIG_CACHE_TTL_SECONDS = 60;

type TSerializedBuffer = { type: "Buffer"; data: number[] };

// Every ciphertext column of the row, derived from its type, so a column added to super_admin fails to compile below
// until get() converts it.
type TEncryptedColumn = {
  [K in keyof TInstanceConfigRecord]-?: NonNullable<TInstanceConfigRecord[K]> extends Buffer ? K : never;
}[keyof TInstanceConfigRecord];

// The row as JSON.stringify writes it: dates become strings, Buffers become { type: "Buffer", data }.
type TCachedRow = Omit<TInstanceConfigRecord, TEncryptedColumn | "createdAt" | "updatedAt"> &
  Partial<Record<TEncryptedColumn, TSerializedBuffer | null>> & { createdAt: string; updatedAt: string };

const toBuffer = (value: TSerializedBuffer | null | undefined) => (value ? Buffer.from(value.data) : null);

export class InstanceConfigCache implements TInstanceConfigCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async get(): Promise<InstanceConfig | null> {
    try {
      const raw = await this.keyStore.getItem(INSTANCE_CONFIG_CACHE_KEY);
      if (!raw) return null;
      // The columns are converted by name rather than with a JSON.parse reviver, which runs once per ciphertext byte
      // and made this every-request read about twenty times slower.
      const row = JSON.parse(raw) as TCachedRow;
      return InstanceConfig.restore({
        ...row,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        encryptedSlackClientId: toBuffer(row.encryptedSlackClientId),
        encryptedSlackClientSecret: toBuffer(row.encryptedSlackClientSecret),
        encryptedMicrosoftTeamsAppId: toBuffer(row.encryptedMicrosoftTeamsAppId),
        encryptedMicrosoftTeamsClientSecret: toBuffer(row.encryptedMicrosoftTeamsClientSecret),
        encryptedMicrosoftTeamsBotId: toBuffer(row.encryptedMicrosoftTeamsBotId),
        encryptedGitHubAppConnectionClientId: toBuffer(row.encryptedGitHubAppConnectionClientId),
        encryptedGitHubAppConnectionClientSecret: toBuffer(row.encryptedGitHubAppConnectionClientSecret),
        encryptedGitHubAppConnectionSlug: toBuffer(row.encryptedGitHubAppConnectionSlug),
        encryptedGitHubAppConnectionId: toBuffer(row.encryptedGitHubAppConnectionId),
        encryptedGitHubAppConnectionPrivateKey: toBuffer(row.encryptedGitHubAppConnectionPrivateKey),
        encryptedEnvOverrides: toBuffer(row.encryptedEnvOverrides)
      });
    } catch (err) {
      logger?.warn({ key: INSTANCE_CONFIG_CACHE_KEY, err }, "Instance config cache read failed");
      return null;
    }
  }

  async set(config: InstanceConfig): Promise<void> {
    try {
      await this.keyStore.setItemWithExpiry(
        INSTANCE_CONFIG_CACHE_KEY,
        INSTANCE_CONFIG_CACHE_TTL_SECONDS,
        JSON.stringify(config.toJSON())
      );
    } catch (err) {
      logger?.warn({ key: INSTANCE_CONFIG_CACHE_KEY, err }, "Instance config cache write failed");
    }
  }

  // For a copy read from the database after a miss: it never replaces one another pod wrote meanwhile, which may come
  // from a commit the replica this one was read from had not caught up with.
  async setIfAbsent(config: InstanceConfig): Promise<void> {
    try {
      await this.keyStore.setItemWithExpiryNX(
        INSTANCE_CONFIG_CACHE_KEY,
        INSTANCE_CONFIG_CACHE_TTL_SECONDS,
        JSON.stringify(config.toJSON())
      );
    } catch (err) {
      logger?.warn({ key: INSTANCE_CONFIG_CACHE_KEY, err }, "Instance config cache write failed");
    }
  }

  async clear(): Promise<void> {
    await this.keyStore.deleteItem(INSTANCE_CONFIG_CACHE_KEY);
  }
}
