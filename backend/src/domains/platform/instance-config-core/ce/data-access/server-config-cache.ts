import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { InstanceConfig, TCachedInstanceConfig } from "../model/instance-config";
import { TInstanceConfigDataAccess } from "./instance-config-data-access";

// Frozen key, TTL and value shape: pods of the previous release read and write the same entry during a rolling
// deploy, and their Slack code decrypts the encrypted columns straight from the cached row. So the full row is
// cached, ciphertext included, and InstanceConfig.toView() drops the ciphertext on the way out.
export const SERVER_CONFIG_CACHE_KEY = "infisical-admin-cfg";
export const SERVER_CONFIG_CACHE_TTL_SECONDS = 60;

// The instance config shared by every pod, read from the database on a miss. Redis failures fall back to the database.
export class ServerConfigCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    private readonly instanceConfig: Pick<TInstanceConfigDataAccess, "findById">
  ) {}

  async get(): Promise<InstanceConfig> {
    const cached = await this.read();
    if (cached) return cached;
    const config = await this.instanceConfig.findById();
    if (!config) throw new NotFoundError({ message: "Admin config not found" });
    await this.set(config);
    return config;
  }

  async set(config: InstanceConfig): Promise<void> {
    try {
      await this.keyStore.setItemWithExpiry(
        SERVER_CONFIG_CACHE_KEY,
        SERVER_CONFIG_CACHE_TTL_SECONDS,
        JSON.stringify(config.toJSON())
      );
    } catch (err) {
      logger?.warn({ key: SERVER_CONFIG_CACHE_KEY, err }, "Instance config cache write failed");
    }
  }

  async clear(): Promise<void> {
    await this.keyStore.deleteItem(SERVER_CONFIG_CACHE_KEY);
  }

  private async read(): Promise<InstanceConfig | null> {
    try {
      const raw = await this.keyStore.getItem(SERVER_CONFIG_CACHE_KEY);
      return raw ? InstanceConfig.fromCached(JSON.parse(raw) as TCachedInstanceConfig) : null;
    } catch (err) {
      logger?.warn({ key: SERVER_CONFIG_CACHE_KEY, err }, "Instance config cache read failed");
      return null;
    }
  }
}
