import { TReadOptions } from "@app/domains/lib/data-access";
import { TStoreLocks } from "@app/domains/lib/transactions";
import type { TOverridableEnvConfig } from "@app/lib/config/env";

import { TEnvOverrideGroups, TEnvOverridesRecord } from "../models/env-overrides";
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

export type TResolvedOverridableEnv =
  | { success: true; config: TOverridableEnvConfig }
  | { success: false; issues: string[] };

// What this domain needs from the env: the overridable keys and the Slack defaults. Built by domains.ts from lib/config/env.ts so this domain never loads it.
export type TInstanceConfigEnv = {
  groups: TEnvOverrideGroups;
  keys: ReadonlySet<string>;
  // Parses the process env with these overrides on top, through the env schema (its coercion, defaults and
  // fallbacks), and returns the overridable keys. One issue line per rejected key.
  resolve(overrides: TEnvOverridesRecord): TResolvedOverridableEnv;
  // Whether the process env as it started sets the key.
  hasEnvValue(key: string): boolean;
  // WORKFLOW_SLACK_CLIENT_ID and WORKFLOW_SLACK_CLIENT_SECRET, which back the Slack credentials an admin has not stored.
  slackDefaults(): { clientId?: string; clientSecret?: string };
};
