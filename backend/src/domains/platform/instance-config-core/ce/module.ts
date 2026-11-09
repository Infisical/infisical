import type { Knex } from "knex";

import { DataAccessDb } from "@app/domains/lib/data-access-db";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner, TTransactionRunner } from "@app/domains/lib/transaction-runner";
import type { startLocalRefresh, TLocalRefreshHandle } from "@app/lib/cron/local-refresh";
import { crypto } from "@app/lib/crypto/cryptography";
import { logger } from "@app/lib/logger";

import {
  buildInstanceConfigCoreDataAccess,
  noInstanceConfigCoreLocks,
  PostgresInstanceConfigCoreLocks,
  TInstanceConfigCoreDataAccess
} from "./data-access/instance-config-core-data-access";
import { InstanceConfigDataAccess } from "./data-access/instance-config-data-access";
import { ServerConfigCache } from "./data-access/server-config-cache";
import { TIntegrationCredentialsProps } from "./model/integration-credentials";
import { EnvOverridesService } from "./service/env-overrides-service";
import { InstanceConfigService } from "./service/instance-config-service";
import {
  TEnvOverridesView,
  TInstanceConfigEnv,
  TInstanceConfigPatch,
  TMicrosoftTeamsCredentials,
  TRootKeyCipher,
  TServerConfigView
} from "./service/instance-config-types";
import { IntegrationCredentialsHolder } from "./service/integration-credentials-holder";
import { IntegrationCredentialsService } from "./service/integration-credentials-service";

export { INSTANCE_CONFIG_ID } from "./model/instance-config";
export type { TIntegrationCredentialsProps as TIntegrationCredentials } from "./model/integration-credentials";
export type {
  TEnvOverridesView,
  TInstanceConfigEnv,
  TInstanceConfigPatch,
  TMicrosoftTeamsCredentials,
  TServerConfigView
} from "./service/instance-config-types";

export type TInstanceConfigCoreDomain = {
  // The instance settings, without credentials. Cached for every pod (60s), so another pod's update shows within that.
  getServerConfig: () => Promise<TServerConfigView>;
  getAdminIdentityIds: () => Promise<string[]>;
  // Refuses an empty patch. Credentials and env overrides are encrypted with the root key before the write.
  updateConfig: (patch: TInstanceConfigPatch) => Promise<TServerConfigView>;
  // Stored Slack credentials, else WORKFLOW_SLACK_CLIENT_ID and WORKFLOW_SLACK_CLIENT_SECRET from env.
  getSlackCredentials: () => Promise<{ clientId: string; clientSecret: string }>;
  // updatedAt is the config row's: it changes on every config update.
  getMicrosoftTeamsCredentials: () => Promise<TMicrosoftTeamsCredentials>;
  getIntegrationCredentials: () => Promise<TIntegrationCredentialsProps>;
  getEnvOverrides: () => Promise<Record<string, string>>;
  getEnvOverridesOrganized: () => Promise<TEnvOverridesView>;
};

export type TInstanceConfigCoreDataAccessDeps = {
  transactionRunner: TTransactionRunner<TInstanceConfigCoreDataAccess>;
  // Outside a transaction. Fetches read the replica unless they pass ReadFrom.Primary.
  dataAccess: TInstanceConfigCoreDataAccess;
};

export type TInstanceConfigCoreDeps = (
  | {
      db: DataAccessDb;
    }
  // Tests pass in-memory data access instead.
  | TInstanceConfigCoreDataAccessDeps
) & {
  keyStore: TDomainKeyStore;
  kmsCoreDomain: TRootKeyCipher;
  env: TInstanceConfigEnv;
  // Runs a task on a timer in this process. Supplied by the wiring: the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  isFipsModeEnabled?: () => boolean;
};

export const buildInstanceConfigCoreDataAccessDeps = (db: DataAccessDb): TInstanceConfigCoreDataAccessDeps => ({
  transactionRunner: new TransactionRunner(db, (trxDb) =>
    buildInstanceConfigCoreDataAccess(trxDb, new PostgresInstanceConfigCoreLocks(trxDb.writer()))
  ),
  dataAccess: buildInstanceConfigCoreDataAccess(db, noInstanceConfigCoreLocks)
});

// The instance configuration: the super_admin row (settings, Slack and Teams credentials, env overrides), cached for
// every pod, and the env overrides applied to this process's env holder. Depends on KMS Core for the root key.
export class InstanceConfigCoreModule {
  readonly name = "instance-config-core";

  readonly service: TInstanceConfigCoreDomain;

  private readonly instanceConfig: InstanceConfigService;

  private readonly envOverrides: EnvOverridesService;

  constructor(private readonly deps: TInstanceConfigCoreDeps) {
    const { transactionRunner, dataAccess } = "db" in deps ? buildInstanceConfigCoreDataAccessDeps(deps.db) : deps;
    const cache = new ServerConfigCache(deps.keyStore);
    const credentials = new IntegrationCredentialsHolder();
    const { kmsCoreDomain, env } = deps;

    this.instanceConfig = new InstanceConfigService({
      transactionRunner,
      dataAccess,
      cache,
      credentials,
      kmsCoreDomain,
      env,
      isFipsModeEnabled: deps.isFipsModeEnabled ?? (() => crypto.isFipsModeEnabled())
    });
    this.envOverrides = new EnvOverridesService({ dataAccess, kmsCoreDomain, env });
    const integrationCredentials = new IntegrationCredentialsService({
      dataAccess,
      cache,
      credentials,
      kmsCoreDomain,
      env
    });

    const { instanceConfig, envOverrides } = this;
    this.service = {
      getServerConfig: () => instanceConfig.getServerConfig(),
      getAdminIdentityIds: () => instanceConfig.getAdminIdentityIds(),
      updateConfig: (patch) => instanceConfig.updateConfig(patch),
      getSlackCredentials: () => integrationCredentials.getSlackCredentials(),
      getMicrosoftTeamsCredentials: () => integrationCredentials.getMicrosoftTeamsCredentials(),
      getIntegrationCredentials: () => integrationCredentials.getIntegrationCredentials(),
      getEnvOverrides: () => envOverrides.getEnvOverrides(),
      getEnvOverridesOrganized: () => envOverrides.getEnvOverridesOrganized()
    };
  }

  // Whether the instance runs in FIPS mode: null before the table or the row exists. A plain read for boot, before
  // migrations and before any module is built.
  static readFipsSetting(knex: Knex): Promise<boolean | null> {
    return InstanceConfigDataAccess.readFipsSetting(knex);
  }

  // Creates the config row on a new instance and clears the shared cache. Called once at boot, before KMS Core starts.
  initialize(): Promise<void> {
    return this.instanceConfig.initialize();
  }

  // Applies the stored env overrides, then re-applies them every five minutes. Called once at boot, after KMS Core
  // started.
  async start(): Promise<TLocalRefreshHandle> {
    logger.info("Setting up background sync process for environment overrides");
    await this.envOverrides.syncNow();
    return this.deps.startLocalRefresh({
      name: "env-config-sync",
      intervalMs: 5 * 60 * 1000,
      task: () => this.envOverrides.syncNow()
    });
  }
}
