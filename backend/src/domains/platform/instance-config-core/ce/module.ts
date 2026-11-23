import type { Knex } from "knex";

import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TransactionRunner, TTransactionRunner } from "@app/domains/lib/transactions";
import type { TKmsRootKeyService } from "@app/domains/platform/kms-core/ce/module";
import { crypto } from "@app/lib/crypto/cryptography";

import { InstanceConfigCache } from "./data-access/instance-config-cache";
import { InstanceConfigStore } from "./data-access/instance-config-store";
import { ResolvedEnvCache } from "./data-access/resolved-env-cache";
import { EnvOverrides, TProcessEnv } from "./models/env-overrides";
import { InstanceConfig } from "./models/instance-config";
import { TInstanceConfigStore, TInstanceConfigStores } from "./services/dependencies";
import { InstanceConfigService, TInstanceConfigService } from "./services/instance-config/service";

export { ReadFrom } from "@app/domains/lib/data-access";
export type { TOverridableEnvConfig } from "./models/env-overrides";
export type { TInstanceConfigSettings } from "./models/instance-config";
export { LoginMethod, LoginPolicy } from "./models/login-policy";
export { SignUpPolicy, SignUpRefusal } from "./models/sign-up-policy";
export type { TInstanceConfigPatch, TInstanceConfigService } from "./services/instance-config/service";

// The env values an instance admin can override, for request schemas that accept them.
export const OVERRIDABLE_ENV_KEYS = EnvOverrides.KEYS;

type TInstanceConfigStoreAccess = {
  transactionRunner: TTransactionRunner<TInstanceConfigStores>;
  // Outside a transaction: the replica on the server.
  instanceConfigStore: TInstanceConfigStore;
};

type TInstanceConfigCoreDeps = (
  | { db: TDbClient }
  // Tests pass in-memory stores instead.
  | TInstanceConfigStoreAccess
) & {
  keyStore: TDomainKeyStore;
  kmsRootKeyService: TKmsRootKeyService;
  // The process env as the server started: Instance Config Core parses the values an admin can override from it.
  processEnv: TProcessEnv;
  isFipsEnabled?: () => boolean;
};

const buildInstanceConfigStoreAccess = (db: TDbClient): TInstanceConfigStoreAccess => ({
  transactionRunner: new TransactionRunner<TInstanceConfigStores>(db, (trx, locks) => ({
    instanceConfigStore: new InstanceConfigStore(singleStoreConnection(trx)),
    locks
  })),
  instanceConfigStore: new InstanceConfigStore(poolStoreConnection(db))
});

// The instance's configuration: the super_admin row (settings, the Slack, Teams and GitHub app credentials, env
// overrides), shared by every pod through Redis, and every env value an instance admin can override, resolved. Depends
// on KMS Core for the root key that encrypts credentials and overrides.
export class InstanceConfigCoreModule {
  readonly name = "instance-config-core";

  private constructor(readonly instanceConfigService: TInstanceConfigService) {}

  // Creates the row on a new instance and drops the shared copy a previous deploy left, before any service exists.
  static async create(deps: TInstanceConfigCoreDeps): Promise<InstanceConfigCoreModule> {
    const { transactionRunner, instanceConfigStore } = "db" in deps ? buildInstanceConfigStoreAccess(deps.db) : deps;
    const isFipsEnabled = deps.isFipsEnabled ?? (() => crypto.isFipsModeEnabled());
    const instanceConfigCache = new InstanceConfigCache(deps.keyStore);

    await instanceConfigCache.clear();
    await transactionRunner.run(({ stores }) =>
      stores.instanceConfigStore.createIfMissing(InstanceConfig.create({ fipsEnabled: isFipsEnabled() }))
    );

    return new InstanceConfigCoreModule(
      new InstanceConfigService(
        transactionRunner,
        instanceConfigStore,
        instanceConfigCache,
        new ResolvedEnvCache(),
        deps.kmsRootKeyService,
        deps.processEnv
      )
    );
  }

  // Whether the instance runs in FIPS mode, null before the table or the row exists. For boot, before migrations and
  // before any module is built.
  static readFipsSetting(knex: Knex): Promise<boolean | null> {
    return InstanceConfigStore.readFipsSetting(knex);
  }

  // Whether an instance admin finished setup. For the boot banner in main.ts, which has no modules.
  static readInitialized(knex: Knex): Promise<boolean> {
    return InstanceConfigStore.readInitialized(knex);
  }
}
