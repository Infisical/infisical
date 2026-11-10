import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { logger } from "@app/lib/logger";

import { InstanceConfig, TInstanceConfigProps } from "../model/instance-config";

// Frozen key, TTL and value shape: pods of the previous release read and write the same entry during a rolling
// deploy, and their Slack code decrypts the encrypted columns straight from the cached row. So the full row is
// cached, ciphertext included.
export const SERVER_CONFIG_CACHE_KEY = "infisical-admin-cfg";
export const SERVER_CONFIG_CACHE_TTL_SECONDS = 60;

// The row as JSON.stringify writes it: dates become strings, Buffers become { type: "Buffer", data }.
type TCachedRow = Omit<TInstanceConfigProps, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

// The instance config shared by every pod. Redis failures read as a miss and a skipped write.
export class ServerConfigCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async get(): Promise<InstanceConfig | null> {
    try {
      const raw = await this.keyStore.getItem(SERVER_CONFIG_CACHE_KEY);
      return raw ? ServerConfigCache.parse(raw) : null;
    } catch (err) {
      logger?.warn({ key: SERVER_CONFIG_CACHE_KEY, err }, "Instance config cache read failed");
      return null;
    }
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

  private static parse(raw: string): InstanceConfig {
    const row = JSON.parse(raw, (_key, value: unknown) =>
      ServerConfigCache.isSerializedBuffer(value) ? Buffer.from(value.data) : value
    ) as TCachedRow;
    return InstanceConfig.restore({ ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) });
  }

  private static isSerializedBuffer(value: unknown): value is { type: "Buffer"; data: number[] } {
    return (
      typeof value === "object" &&
      value !== null &&
      "type" in value &&
      value.type === "Buffer" &&
      "data" in value &&
      Array.isArray(value.data)
    );
  }
}
