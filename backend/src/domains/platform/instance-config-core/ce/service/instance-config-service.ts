import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { DatabaseError } from "@app/lib/errors";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { ServerConfigCache } from "../data-access/server-config-cache";
import { InstanceConfig, TServerConfigView } from "../model/instance-config";
import { buildConfigChange, decryptCredentials, loadServerConfig } from "./instance-config-fns";
import { TInstanceConfigEnv, TInstanceConfigPatch, TRootKeyCipher } from "./instance-config-types";
import { IntegrationCredentialsHolder } from "./integration-credentials-holder";

export type TInstanceConfigServiceDeps = {
  transactionRunner: TTransactionRunner<TInstanceConfigCoreDataAccess>;
  dataAccess: TInstanceConfigCoreDataAccess;
  cache: ServerConfigCache;
  credentials: IntegrationCredentialsHolder;
  kmsCoreDomain: TRootKeyCipher;
  env: TInstanceConfigEnv;
  isFipsModeEnabled: () => boolean;
};

export class InstanceConfigService {
  constructor(private readonly deps: TInstanceConfigServiceDeps) {}

  // Creates the row on a new instance. Runs before KMS Core starts, so it never encrypts or decrypts.
  async initialize(): Promise<void> {
    await this.deps.cache.clear();
    await this.deps.transactionRunner.run(({ dataAccess }) =>
      dataAccess.instanceConfig.createIfMissing(InstanceConfig.initial({ fipsEnabled: this.deps.isFipsModeEnabled() }))
    );
  }

  async getServerConfig(): Promise<TServerConfigView> {
    const config = await loadServerConfig(this.deps.cache, this.deps.dataAccess);
    return config.toView();
  }

  async getAdminIdentityIds(): Promise<string[]> {
    const config = await loadServerConfig(this.deps.cache, this.deps.dataAccess);
    return config.adminIdentityIds;
  }

  async updateConfig(patch: TInstanceConfigPatch): Promise<TServerConfigView> {
    const { env, kmsCoreDomain, cache, credentials } = this.deps;
    // Encrypts with the root key before the transaction opens.
    const change = buildConfigChange(patch, env, kmsCoreDomain);

    const config = await this.deps.transactionRunner.run(async ({ dataAccess, tx }) => {
      await dataAccess.instanceConfig.update(change);
      const updated = await dataAccess.instanceConfig.findById();
      if (!updated) throw new DatabaseError({ error: "Updated row not found", name: "Update instance config" });

      tx.afterCommit(async () => {
        await cache.set(updated);
        credentials.set(decryptCredentials(updated, kmsCoreDomain));
        if (patch.envOverrides !== undefined) env.overrideEnvConfig(patch.envOverrides);
      });
      return updated;
    });
    return config.toView();
  }
}
