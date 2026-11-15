import { findOnReplicaThenPrimary, ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { TTransactionRunner } from "@app/domains/lib/transactions";
import type { TKmsRootKeyService } from "@app/domains/platform/kms-core/ce/module";
import type { TOverridableEnvConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";

import { EnvOverrides, TEnvOverridesRecord, TOrganizedEnvOverrides } from "../../models/env-overrides";
import { GitHubAppCredentials } from "../../models/github-app-credentials";
import { InstanceConfig, TInstanceConfigSettings } from "../../models/instance-config";
import { MicrosoftTeamsAppCredentials } from "../../models/microsoft-teams-app-credentials";
import { SlackAppCredentials } from "../../models/slack-app-credentials";
import {
  TInstanceConfigCache,
  TInstanceConfigEnv,
  TInstanceConfigStore,
  TInstanceConfigStores,
  TResolvedEnvCache,
  TResolvedOverridableEnv
} from "../dependencies";

// The instance's settings and every env value an instance admin can override, resolved: the override when one is
// stored, otherwise the process env.
export type TInstanceConfig = TInstanceConfigSettings & TOverridableEnvConfig;

// What an instance admin can change from the admin console. Credentials and overrides are plain text here.
export type TInstanceConfigPatch = {
  allowSignUp?: boolean;
  allowedSignUpDomain?: string | null;
  trustLdapEmails?: boolean;
  onboardingCompleted?: boolean;
  defaultAuthOrgId?: string | null;
  enabledLoginMethods?: string[];
  authConsentContent?: string;
  pageFrameContent?: string;
  allowedStorageHostnames?: string[];
  slackClientId?: string;
  slackClientSecret?: string;
  microsoftTeamsAppId?: string;
  microsoftTeamsClientSecret?: string;
  microsoftTeamsBotId?: string;
  gitHubAppConnectionClientId?: string;
  gitHubAppConnectionClientSecret?: string;
  gitHubAppConnectionSlug?: string;
  gitHubAppConnectionId?: string;
  gitHubAppConnectionPrivateKey?: string;
  envOverrides?: TEnvOverridesRecord;
};

export type TMicrosoftTeamsCredentials = {
  credentials: MicrosoftTeamsAppCredentials;
  // The config row's updatedAt, which changes on every config update: the Teams bot rebuilds when it moves.
  configUpdatedAt: Date;
};

export type TIntegrationCredentials = {
  slack: SlackAppCredentials;
  microsoftTeams: MicrosoftTeamsAppCredentials;
  gitHubAppConnection: GitHubAppCredentials;
};

export type TInstanceConfigService = {
  // Read from the copy every pod shares (60s), so another pod's change shows within that.
  getInstanceConfig(): Promise<TInstanceConfig>;
  isInstanceAdminIdentity(identityId: string): Promise<boolean>;
  getSlackCredentials(): Promise<SlackAppCredentials>;
  // Pass { readFrom: ReadFrom.Primary } to read the committed row instead of the shared copy, as after your own update.
  getMicrosoftTeamsCredentials(options?: TReadOptions): Promise<TMicrosoftTeamsCredentials>;
  getIntegrationCredentials(): Promise<TIntegrationCredentials>;
  getEnvOverridesOrganized(): Promise<TOrganizedEnvOverrides>;
  // Refuses a patch that sets nothing.
  updateConfig(patch: TInstanceConfigPatch): Promise<TInstanceConfigSettings>;
  completeSetup(input: { closeSignUp: boolean; adminIdentityId?: string }): Promise<void>;
  revokeAdminIdentity(identityId: string): Promise<void>;
};

const configNotFound = () => new EntityNotFoundError({ name: "AdminConfig", message: "Admin config not found" });

export class InstanceConfigService implements TInstanceConfigService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TInstanceConfigStores>,
    private readonly instanceConfigStore: TInstanceConfigStore,
    private readonly instanceConfigCache: TInstanceConfigCache,
    private readonly resolvedEnvCache: TResolvedEnvCache,
    private readonly kmsRootKeyService: TKmsRootKeyService,
    private readonly instanceConfigEnv: TInstanceConfigEnv
  ) {}

  async getInstanceConfig(): Promise<TInstanceConfig> {
    const config = await this.readConfig();
    return { ...config.toSettings(), ...this.resolveOverridableEnv(config) };
  }

  async isInstanceAdminIdentity(identityId: string): Promise<boolean> {
    const config = await this.readConfig();
    return config.isAdminIdentity(identityId);
  }

  async getSlackCredentials(): Promise<SlackAppCredentials> {
    const config = await this.readConfig();
    return config
      .slackCredentials(this.kmsRootKeyService.decryptWithRootKey())
      .orEnv(this.instanceConfigEnv.slackDefaults());
  }

  async getMicrosoftTeamsCredentials(options?: TReadOptions): Promise<TMicrosoftTeamsCredentials> {
    const config = await this.readConfig(options);
    return {
      credentials: config.microsoftTeamsCredentials(this.kmsRootKeyService.decryptWithRootKey()),
      configUpdatedAt: config.updatedAt
    };
  }

  async getIntegrationCredentials(): Promise<TIntegrationCredentials> {
    const config = await this.readConfig();
    const open = this.kmsRootKeyService.decryptWithRootKey();
    return {
      slack: config.slackCredentials(open),
      microsoftTeams: config.microsoftTeamsCredentials(open),
      gitHubAppConnection: config.gitHubAppCredentials(open)
    };
  }

  async getEnvOverridesOrganized(): Promise<TOrganizedEnvOverrides> {
    const config = await this.readConfig();
    return config
      .envOverrides(this.kmsRootKeyService.decryptWithRootKey())
      .organize(this.instanceConfigEnv.groups, (key) => this.instanceConfigEnv.hasEnvValue(key));
  }

  async updateConfig(patch: TInstanceConfigPatch): Promise<TInstanceConfigSettings> {
    if (!Object.values(patch).some((value) => value !== undefined)) {
      throw new RuleViolationError({
        message:
          "No recognized instance configuration fields were provided. Settings that have been removed are no longer accepted."
      });
    }
    const overrides =
      patch.envOverrides !== undefined
        ? EnvOverrides.create(patch.envOverrides, this.instanceConfigEnv.keys, (values) => {
            const resolved = this.instanceConfigEnv.resolve(values);
            return resolved.success ? [] : resolved.issues;
          })
        : undefined;
    const seal = this.kmsRootKeyService.encryptWithRootKey();

    const updated = await this.change((config) => {
      config.changeSignUpPolicy({
        allowSignUp: patch.allowSignUp,
        allowedSignUpDomain: patch.allowedSignUpDomain,
        trustLdapEmails: patch.trustLdapEmails
      });
      if (patch.enabledLoginMethods !== undefined) config.changeLoginMethods(patch.enabledLoginMethods);
      if (patch.defaultAuthOrgId !== undefined) config.changeDefaultAuthOrg(patch.defaultAuthOrgId);
      config.changeBranding({ authConsentContent: patch.authConsentContent, pageFrameContent: patch.pageFrameContent });
      if (patch.allowedStorageHostnames !== undefined) {
        config.changeAllowedStorageHostnames(patch.allowedStorageHostnames);
      }
      if (patch.onboardingCompleted !== undefined) config.changeOnboardingStatus(patch.onboardingCompleted);
      config.changeSlackCredentials({ clientId: patch.slackClientId, clientSecret: patch.slackClientSecret }, seal);
      config.changeMicrosoftTeamsCredentials(
        {
          appId: patch.microsoftTeamsAppId,
          clientSecret: patch.microsoftTeamsClientSecret,
          botId: patch.microsoftTeamsBotId
        },
        seal
      );
      config.changeGitHubAppCredentials(
        {
          clientId: patch.gitHubAppConnectionClientId,
          clientSecret: patch.gitHubAppConnectionClientSecret,
          appSlug: patch.gitHubAppConnectionSlug,
          appId: patch.gitHubAppConnectionId,
          privateKey: patch.gitHubAppConnectionPrivateKey
        },
        seal
      );
      if (overrides) config.replaceEnvOverrides(overrides, seal);
    });
    return updated.toSettings();
  }

  async completeSetup({ closeSignUp, adminIdentityId }: { closeSignUp: boolean; adminIdentityId?: string }) {
    await this.change((config) => {
      config.completeSetup({ closeSignUp });
      if (adminIdentityId) config.grantAdminIdentity(adminIdentityId);
    });
  }

  async revokeAdminIdentity(identityId: string) {
    await this.change((config) => config.revokeAdminIdentity(identityId));
  }

  // Applies a change under the row lock, then rewrites the shared copy once the change has committed. Reads the row
  // back to return the joined default auth org fields for the org it now names.
  private change(apply: (config: InstanceConfig) => void): Promise<InstanceConfig> {
    return this.transactionRunner.run(async ({ stores, tx }) => {
      const config = await stores.instanceConfigStore.findForUpdate();
      if (!config) throw configNotFound();
      apply(config);
      await stores.instanceConfigStore.save(config);
      const saved = await stores.instanceConfigStore.find();
      if (!saved) throw configNotFound();
      tx.afterCommit(() => this.instanceConfigCache.set(saved));
      return saved;
    });
  }

  // The shared copy, else the replica, cached on the way out. ReadFrom.Primary reads the primary and leaves the
  // copy alone.
  private async readConfig(options?: TReadOptions): Promise<InstanceConfig> {
    const find = (readOptions?: TReadOptions) => this.instanceConfigStore.find(readOptions);
    if (options?.readFrom === ReadFrom.Primary) return findOnReplicaThenPrimary(find, configNotFound, options);

    const cached = await this.instanceConfigCache.get();
    if (cached) return cached;
    // A replica may not have caught up with the row the module created at boot.
    const config = await findOnReplicaThenPrimary(find, configNotFound);
    await this.instanceConfigCache.set(config);
    return config;
  }

  // Resolved once per stored overrides in this process: parsing the env is far too slow for every read. Overrides that
  // cannot be read, or that the env schema no longer accepts (stored before a schema change), fall back to the process
  // env, as applying them always did, so one bad column never takes down every settings read.
  private resolveOverridableEnv(config: InstanceConfig): TOverridableEnvConfig {
    const version = config.envOverridesVersion();
    const cached = this.resolvedEnvCache.get(version);
    if (cached) return cached;

    let resolved: TResolvedOverridableEnv;
    try {
      const overrides = config.envOverrides(this.kmsRootKeyService.decryptWithRootKey());
      resolved = this.instanceConfigEnv.resolve(overrides.toJSON());
    } catch (error) {
      logger?.error(error, "Stored env overrides cannot be read; using the process env instead");
      resolved = { success: false, issues: [] };
    }
    if (!resolved.success) {
      if (resolved.issues.length > 0) {
        logger?.warn(
          { issues: resolved.issues },
          "Stored env overrides no longer parse; using the process env instead"
        );
      }
      resolved = this.instanceConfigEnv.resolve({});
      if (!resolved.success) throw new Error(`The process env does not parse: ${resolved.issues.join("; ")}`);
    }
    this.resolvedEnvCache.set(version, resolved.config);
    return resolved.config;
  }
}
