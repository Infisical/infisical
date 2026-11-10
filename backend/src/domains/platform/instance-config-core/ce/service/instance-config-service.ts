import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access-db";
import { TTransactionRunner } from "@app/domains/lib/transaction-runner";
import type { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { TInstanceConfigUpdate } from "../data-access/instance-config-data-access";
import { ServerConfigCache } from "../data-access/server-config-cache";
import { InstanceConfig, TEncryptedColumn } from "../model/instance-config";
import {
  TEnvOverridesView,
  TInstanceConfigEnv,
  TInstanceConfigPatch,
  TIntegrationCredentials,
  TMicrosoftTeamsCredentials,
  TServerConfigView
} from "./instance-config-types";
import { IntegrationCredentialsHolder } from "./integration-credentials-holder";

export type TInstanceConfigServiceDeps = {
  transactionRunner: TTransactionRunner<TInstanceConfigCoreDataAccess>;
  // Outside a transaction, for reads.
  dataAccess: TInstanceConfigCoreDataAccess;
  cache: ServerConfigCache;
  credentials: IntegrationCredentialsHolder;
  kmsCoreDomain: TKmsCoreDomain;
  env: TInstanceConfigEnv;
  isFipsModeEnabled: () => boolean;
};

export class InstanceConfigService {
  constructor(private readonly deps: TInstanceConfigServiceDeps) {}

  // Creates the row on a new instance. Runs before KMS Core starts, so it never encrypts or decrypts.
  async initialize(): Promise<void> {
    await this.deps.cache.clear();
    await this.deps.transactionRunner.run(({ dataAccess }) =>
      dataAccess.instanceConfig.createIfMissing(
        InstanceConfig.initialSettings({ fipsEnabled: this.deps.isFipsModeEnabled() })
      )
    );
  }

  async getServerConfig(): Promise<TServerConfigView> {
    const config = await this.getCachedConfigOrThrow();
    return config.toSettings();
  }

  async getAdminIdentityIds(): Promise<string[]> {
    const config = await this.getCachedConfigOrThrow();
    return config.adminIdentityIds;
  }

  async updateConfig(patch: TInstanceConfigPatch): Promise<TServerConfigView> {
    const { env, cache } = this.deps;
    const columns = this.encryptPatchIntoColumns(patch);

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
    return config.toSettings();
  }

  // The stored credentials, or WORKFLOW_SLACK_CLIENT_ID and WORKFLOW_SLACK_CLIENT_SECRET when none are stored.
  async getSlackCredentials(): Promise<{ clientId: string; clientSecret: string }> {
    const config = await this.getCachedConfigOrThrow();
    const slack = this.decryptSlackCredentials(config);
    const envCfg = this.deps.env.getConfig();
    return {
      clientId: slack.clientId || envCfg.WORKFLOW_SLACK_CLIENT_ID || "",
      clientSecret: slack.clientSecret || envCfg.WORKFLOW_SLACK_CLIENT_SECRET || ""
    };
  }

  // Reads the cached row unless the caller asks for the primary, as a caller acting on its own update must.
  async getMicrosoftTeamsCredentials(options?: TReadOptions): Promise<TMicrosoftTeamsCredentials> {
    const config = await this.getCachedConfigOrThrow(options);
    return { ...this.decryptMicrosoftTeamsCredentials(config), updatedAt: config.updatedAt };
  }

  async getIntegrationCredentials(): Promise<TIntegrationCredentials> {
    const config = await this.getCachedConfigOrThrow();
    return {
      slack: this.decryptSlackCredentials(config),
      microsoftTeams: this.decryptMicrosoftTeamsCredentials(config),
      gitHubAppConnection: this.decryptGitHubAppCredentials(config)
    };
  }

  // No row yet means no overrides: a new instance boots before its replica has the row initialize() just created.
  async getEnvOverrides(): Promise<Record<string, string>> {
    const config = await this.findCachedConfig();
    const cipherText = config?.encrypted("encryptedEnvOverrides");
    if (!cipherText) return {};
    return JSON.parse(this.deps.kmsCoreDomain.decryptWithRootKey()(cipherText).toString()) as Record<string, string>;
  }

  async getEnvOverridesOrganized(): Promise<TEnvOverridesView> {
    const overrides = await this.getEnvOverrides();
    const original = this.deps.env.getOriginalConfig() ?? {};
    return Object.fromEntries(
      Object.entries(this.deps.env.overridableGroups).map(([groupKey, group]) => [
        groupKey,
        {
          name: group.name,
          fields: group.fields.map(({ key, description }) => ({
            key,
            description,
            value: overrides[key] || "",
            hasEnvEntry: Boolean(original[key])
          }))
        }
      ])
    );
  }

  // Applies the stored overrides to this process's env holder.
  async syncEnvOverrides(): Promise<void> {
    const overrides = await this.getEnvOverrides();
    this.deps.env.overrideEnvConfig(overrides);
  }

  // The config row from the shared cache, read from the replica and cached on a miss. ReadFrom.Primary reads the
  // primary and leaves the cache alone. Undefined when the instance has no row yet.
  private async findCachedConfig(options?: TReadOptions): Promise<InstanceConfig | undefined> {
    const { cache, dataAccess } = this.deps;
    if (options?.readFrom === ReadFrom.Primary) return dataAccess.instanceConfig.findById(options);

    const cached = await cache.get();
    if (cached) return cached;
    const config = await dataAccess.instanceConfig.findById();
    if (config) await cache.set(config);
    return config;
  }

  // As findCachedConfig, but refuses with "Admin config not found" when there is no row.
  private async getCachedConfigOrThrow(options?: TReadOptions): Promise<InstanceConfig> {
    const config = await this.findCachedConfig(options);
    if (!config) throw new NotFoundError({ message: "Admin config not found" });
    return config;
  }

  // Each integration's credentials are decrypted on their own, once per row version (the holder keeps them), so a column
  // that cannot be decrypted breaks only its own integration.
  private decryptSlackCredentials(config: InstanceConfig): TIntegrationCredentials["slack"] {
    return this.deps.credentials.remember(config.updatedAt, "slack", () => ({
      clientId: this.decryptColumn(config, "encryptedSlackClientId"),
      clientSecret: this.decryptColumn(config, "encryptedSlackClientSecret")
    }));
  }

  private decryptMicrosoftTeamsCredentials(config: InstanceConfig): TIntegrationCredentials["microsoftTeams"] {
    return this.deps.credentials.remember(config.updatedAt, "microsoftTeams", () => ({
      appId: this.decryptColumn(config, "encryptedMicrosoftTeamsAppId"),
      clientSecret: this.decryptColumn(config, "encryptedMicrosoftTeamsClientSecret"),
      botId: this.decryptColumn(config, "encryptedMicrosoftTeamsBotId")
    }));
  }

  private decryptGitHubAppCredentials(config: InstanceConfig): TIntegrationCredentials["gitHubAppConnection"] {
    return this.deps.credentials.remember(config.updatedAt, "gitHubAppConnection", () => ({
      clientId: this.decryptColumn(config, "encryptedGitHubAppConnectionClientId"),
      clientSecret: this.decryptColumn(config, "encryptedGitHubAppConnectionClientSecret"),
      appSlug: this.decryptColumn(config, "encryptedGitHubAppConnectionSlug"),
      appId: this.decryptColumn(config, "encryptedGitHubAppConnectionId"),
      privateKey: this.decryptColumn(config, "encryptedGitHubAppConnectionPrivateKey")
    }));
  }

  // One encrypted column as text; "" when it is not set.
  private decryptColumn(config: InstanceConfig, column: TEncryptedColumn): string {
    const cipherText = config.encrypted(column);
    return cipherText ? this.deps.kmsCoreDomain.decryptWithRootKey()(cipherText).toString() : "";
  }

  // The super_admin columns a patch writes: settings as given, credentials and env overrides validated and encrypted with
  // the root key. Slack and Teams credentials can be changed but not cleared; GitHub app credentials and env overrides
  // are encrypted whenever present, so "" clears them. Refuses a patch that writes nothing.
  private encryptPatchIntoColumns(patch: TInstanceConfigPatch): TInstanceConfigUpdate {
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
    const ifGiven = (value?: string) => (value !== undefined ? encrypt(Buffer.from(value)) : undefined);
    const notEmpty = (label: string, value?: string) => {
      if (value === "") {
        throw new BadRequestError({
          message: `${label} cannot be empty. Slack and Microsoft Teams credentials can be changed but not cleared.`
        });
      }
      return ifGiven(value);
    };

    const columns: TInstanceConfigUpdate = {
      ...settings,
      encryptedSlackClientId: notEmpty("Slack client ID", slackClientId),
      encryptedSlackClientSecret: notEmpty("Slack client secret", slackClientSecret),
      encryptedMicrosoftTeamsAppId: notEmpty("Microsoft Teams app ID", microsoftTeamsAppId),
      encryptedMicrosoftTeamsClientSecret: notEmpty("Microsoft Teams client secret", microsoftTeamsClientSecret),
      encryptedMicrosoftTeamsBotId: notEmpty("Microsoft Teams bot ID", microsoftTeamsBotId),
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
