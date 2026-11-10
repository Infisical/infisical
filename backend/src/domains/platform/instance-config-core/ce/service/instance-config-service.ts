import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import { BadRequestError, DatabaseError } from "@app/lib/errors";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { TInstanceConfigUpdate } from "../data-access/instance-config-data-access";
import { ServerConfigCache } from "../data-access/server-config-cache";
import { InstanceConfig, TServerConfigView } from "../model/instance-config";
import { TInstanceConfigEnv, TInstanceConfigPatch, TRootKeyCipher } from "./instance-config-types";

export type TInstanceConfigServiceDeps = {
  transactionRunner: TTransactionRunner<TInstanceConfigCoreDataAccess>;
  cache: ServerConfigCache;
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
    const config = await this.deps.cache.get();
    return config.toView();
  }

  async getAdminIdentityIds(): Promise<string[]> {
    const config = await this.deps.cache.get();
    return config.adminIdentityIds;
  }

  async updateConfig(patch: TInstanceConfigPatch): Promise<TServerConfigView> {
    const { env, cache } = this.deps;
    // Encrypts with the root key before the transaction opens.
    const columns = this.toColumns(patch);

    const config = await this.deps.transactionRunner.run(async ({ dataAccess, tx }) => {
      await dataAccess.instanceConfig.update(columns);
      const updated = await dataAccess.instanceConfig.findById();
      if (!updated) throw new DatabaseError({ error: "Updated row not found", name: "Update instance config" });

      tx.afterCommit(async () => {
        await cache.set(updated);
        if (patch.envOverrides !== undefined) env.overrideEnvConfig(patch.envOverrides);
      });
      return updated;
    });
    return config.toView();
  }

  // Slack and Teams credentials are encrypted only when given a value; GitHub app credentials and env overrides
  // whenever present, so they can be cleared.
  private toColumns(patch: TInstanceConfigPatch): TInstanceConfigUpdate {
    const {
      slackClientId,
      slackClientSecret,
      microsoftTeamsAppId,
      microsoftTeamsClientSecret,
      microsoftTeamsBotId,
      gitHubAppConnectionClientId,
      gitHubAppConnectionClientSecret,
      gitHubAppConnectionSlug,
      gitHubAppConnectionId,
      gitHubAppConnectionPrivateKey,
      envOverrides,
      ...settings
    } = patch;

    if (envOverrides !== undefined) this.validateEnvOverrides(envOverrides);

    const encrypt = this.deps.kmsCoreDomain.encryptWithRootKey();
    const ifSet = (value?: string) => (value ? encrypt(Buffer.from(value)) : undefined);
    const ifGiven = (value?: string) => (value !== undefined ? encrypt(Buffer.from(value)) : undefined);

    const columns: TInstanceConfigUpdate = {
      ...settings,
      encryptedSlackClientId: ifSet(slackClientId),
      encryptedSlackClientSecret: ifSet(slackClientSecret),
      encryptedMicrosoftTeamsAppId: ifSet(microsoftTeamsAppId),
      encryptedMicrosoftTeamsClientSecret: ifSet(microsoftTeamsClientSecret),
      encryptedMicrosoftTeamsBotId: ifSet(microsoftTeamsBotId),
      encryptedGitHubAppConnectionClientId: ifGiven(gitHubAppConnectionClientId),
      encryptedGitHubAppConnectionClientSecret: ifGiven(gitHubAppConnectionClientSecret),
      encryptedGitHubAppConnectionSlug: ifGiven(gitHubAppConnectionSlug),
      encryptedGitHubAppConnectionId: ifGiven(gitHubAppConnectionId),
      encryptedGitHubAppConnectionPrivateKey: ifGiven(gitHubAppConnectionPrivateKey),
      encryptedEnvOverrides: envOverrides !== undefined ? encrypt(Buffer.from(JSON.stringify(envOverrides))) : undefined
    };

    const set = Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined));
    if (Object.keys(set).length === 0) {
      throw new BadRequestError({
        message:
          "No recognized instance configuration fields were provided. Settings that have been removed are no longer accepted."
      });
    }
    return set;
  }

  // Refuses overrides the env schema rejects. Keys that cannot be overridden are ignored, as they are when applied.
  private validateEnvOverrides(overrides: Record<string, string>) {
    const { env } = this.deps;
    const allowed = Object.fromEntries(Object.entries(overrides).filter(([key]) => env.overridableKeys.has(key)));
    const parsed = env.parseWithOverrides(allowed);
    if (!parsed.success) {
      throw new BadRequestError({
        message: parsed.issues.map((issue) => `Key: "${issue.path.join(".")}", Error: ${issue.message}`).join("\n")
      });
    }
  }
}
