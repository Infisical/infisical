import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";

import { TOverridableEnvConfig } from "../models/env-overrides";
import { InstanceConfig } from "../models/instance-config";

// Owns super_admin: one row for the whole instance. Its reads also join organizations, saml_configs and oidc_configs
// for the default auth org (a declared exception, see ../../AGENTS.md).
export type TInstanceConfigStore = {
  find(options?: TReadOptions): Promise<InstanceConfig | null>;
  // Locks the row until the transaction ends, so concurrent admin edits apply one after the other.
  findForUpdate(): Promise<InstanceConfig | null>;
  // INSERT ... ON CONFLICT (id) DO NOTHING: any number of pods booting at once leave the one row.
  createIfMissing(config: InstanceConfig): Promise<void>;
  // Writes the row's own columns, never the joined default auth org fields.
  save(config: InstanceConfig): Promise<void>;
};

// The row shared by every pod in Redis (key, TTL and value are frozen, see ../data-access/instance-config-cache.ts).
// A Redis failure reads as a miss and skips the write.
export type TInstanceConfigCache = {
  get(): Promise<InstanceConfig | null>;
  set(config: InstanceConfig): Promise<void>;
  // Writes only when there is no copy, for a row read after a miss.
  setIfAbsent(config: InstanceConfig): Promise<void>;
  clear(): Promise<void>;
};

// This process's last resolution of the overridable env, keyed by the stored overrides it was resolved from.
export type TResolvedEnvCache = {
  get(version: string): TOverridableEnvConfig | null;
  set(version: string, config: TOverridableEnvConfig): void;
};

export type TInstanceConfigStores = {
  instanceConfigStore: TInstanceConfigStore;
  locks: TStoreLocks;
};
