import { findOnReplicaThenPrimary, ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { RuleViolationError } from "@app/domains/lib/errors";
import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import type { TKmsRootKeyService } from "@app/domains/platform/kms-core/ce/module";
import { logger } from "@app/lib/logger";

import {
  EnvOverrides,
  TEnvOverridesRecord,
  TOrganizedEnvOverrides,
  TOverridableEnvConfig,
  TProcessEnv
} from "../../models/env-overrides";
import { GitHubAppCredentials } from "../../models/github-app-credentials";
import { InstanceConfig, TInstanceConfigSettings } from "../../models/instance-config";
import { LoginMethod, LoginPolicy } from "../../models/login-policy";
import { MicrosoftTeamsAppCredentials } from "../../models/microsoft-teams-app-credentials";
import { SignUpPolicy } from "../../models/sign-up-policy";
import { SlackAppCredentials } from "../../models/slack-app-credentials";
import { TInstanceConfigCache, TInstanceConfigStore, TInstanceConfigStores, TResolvedEnvCache } from "../dependencies";
import { configNotFound, InstanceConfigTransaction, TInstanceConfigTransaction } from "./instance-config-transaction";

// What an instance admin can change from the admin console. Credentials and overrides are plain text here.
export type TInstanceConfigPatch = {
  allowSignUp?: boolean;
  allowedSignUpDomain?: string | null;
  trustLdapEmails?: boolean;
  onboardingCompleted?: boolean;
  defaultAuthOrgId?: string | null;
  enabledLoginMethods?: LoginMethod[];
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
  // Every read below comes from the copy every pod shares (60s), so another pod's change shows within that.
  getSettings(): Promise<TInstanceConfigSettings>;
  // Every env value an instance admin can override, resolved: the override when one is stored, otherwise the process
  // env. Holds plaintext secrets: destructure the keys you need.
  getOverridableEnv(): Promise<TOverridableEnvConfig>;
  // Ask these whether a login method is enabled or an email may sign up, instead of reading the settings.
  getLoginPolicy(): Promise<LoginPolicy>;
  getSignUpPolicy(): Promise<SignUpPolicy>;
  isInstanceAdminIdentity(identityId: string): Promise<boolean>;
  getSlackCredentials(): Promise<SlackAppCredentials>;
  // Pass { readFrom: ReadFrom.Primary } to read the committed row instead of the shared copy, as after your own update.
  getMicrosoftTeamsCredentials(options?: TReadOptions): Promise<TMicrosoftTeamsCredentials>;
  getIntegrationCredentials(): Promise<TIntegrationCredentials>;
  getEnvOverridesOrganized(): Promise<TOrganizedEnvOverrides>;
  // Refuses a patch that sets nothing.
  updateConfig(patch: TInstanceConfigPatch): Promise<TInstanceConfigSettings>;
  // Setup, inside the caller's transaction (see TInstanceConfigTransaction). The caller refreshes the shared copy after
  // its commit, since a joined transaction cannot run after-commit work.
  within(tx: TTransaction): TInstanceConfigTransaction;
  refreshSharedCopy(): Promise<void>;
  revokeAdminIdentity(identityId: string): Promise<void>;
};

export class InstanceConfigService implements TInstanceConfigService {
  constructor(
    private readonly transactionRunner: TTransactionRunner<TInstanceConfigStores>,
    private readonly instanceConfigStore: TInstanceConfigStore,
    private readonly instanceConfigCache: TInstanceConfigCache,
    private readonly resolvedEnvCache: TResolvedEnvCache,
    private readonly kmsRootKeyService: TKmsRootKeyService,
    private readonly processEnv: TProcessEnv
  ) {}

  async getSettings(): Promise<TInstanceConfigSettings> {
    const config = await this.readConfig();
    return config.toSettings();
  }

  async getOverridableEnv(): Promise<TOverridableEnvConfig> {
    const config = await this.readConfig();
    return this.resolveOverridableEnv(config);
  }

  async getLoginPolicy(): Promise<LoginPolicy> {
    const config = await this.readConfig();
    return config.loginPolicy();
  }

  async getSignUpPolicy(): Promise<SignUpPolicy> {
    const config = await this.readConfig();
    return config.signUpPolicy();
  }

  async isInstanceAdminIdentity(identityId: string): Promise<boolean> {
    const config = await this.readConfig();
    return config.isAdminIdentity(identityId);
  }

  async getSlackCredentials(): Promise<SlackAppCredentials> {
    const config = await this.readConfig();
    return config.slackCredentials(this.kmsRootKeyService.decryptWithRootKey()).orEnv({
      clientId: this.processEnv.WORKFLOW_SLACK_CLIENT_ID?.trim(),
      clientSecret: this.processEnv.WORKFLOW_SLACK_CLIENT_SECRET?.trim()
    });
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
    const decrypt = this.kmsRootKeyService.decryptWithRootKey();
    return {
      slack: config.slackCredentials(decrypt),
      microsoftTeams: config.microsoftTeamsCredentials(decrypt),
      gitHubAppConnection: config.gitHubAppCredentials(decrypt)
    };
  }

  async getEnvOverridesOrganized(): Promise<TOrganizedEnvOverrides> {
    const config = await this.readConfig();
    return config.envOverrides(this.kmsRootKeyService.decryptWithRootKey()).organize(this.processEnv);
  }

  async updateConfig(patch: TInstanceConfigPatch): Promise<TInstanceConfigSettings> {
    if (!Object.values(patch).some((value) => value !== undefined)) {
      throw new RuleViolationError({
        message:
          "No recognized instance configuration fields were provided. Settings that have been removed are no longer accepted."
      });
    }
    const overrides = patch.envOverrides !== undefined ? EnvOverrides.create(patch.envOverrides) : undefined;
    const encrypt = this.kmsRootKeyService.encryptWithRootKey();

    const updated = await this.change((config) => {
      config.changeSignUpPolicy({
        allowSignUp: patch.allowSignUp,
        allowedSignUpDomain: patch.allowedSignUpDomain
      });
      if (patch.trustLdapEmails !== undefined) config.changeTrustLdapEmails(patch.trustLdapEmails);
      if (patch.enabledLoginMethods !== undefined) config.changeLoginMethods(patch.enabledLoginMethods);
      if (patch.defaultAuthOrgId !== undefined) config.changeDefaultAuthOrg(patch.defaultAuthOrgId);
      config.changeBranding({ authConsentContent: patch.authConsentContent, pageFrameContent: patch.pageFrameContent });
      if (patch.allowedStorageHostnames !== undefined) {
        config.changeAllowedStorageHostnames(patch.allowedStorageHostnames);
      }
      if (patch.onboardingCompleted !== undefined) config.changeOnboardingStatus(patch.onboardingCompleted);
      config.changeSlackCredentials({ clientId: patch.slackClientId, clientSecret: patch.slackClientSecret }, encrypt);
      config.changeMicrosoftTeamsCredentials(
        {
          appId: patch.microsoftTeamsAppId,
          clientSecret: patch.microsoftTeamsClientSecret,
          botId: patch.microsoftTeamsBotId
        },
        encrypt
      );
      config.changeGitHubAppCredentials(
        {
          clientId: patch.gitHubAppConnectionClientId,
          clientSecret: patch.gitHubAppConnectionClientSecret,
          appSlug: patch.gitHubAppConnectionSlug,
          appId: patch.gitHubAppConnectionId,
          privateKey: patch.gitHubAppConnectionPrivateKey
        },
        encrypt
      );
      if (overrides) config.replaceEnvOverrides(overrides, encrypt);
    });
    return updated.toSettings();
  }

  within(tx: TTransaction): TInstanceConfigTransaction {
    return new InstanceConfigTransaction(this.transactionRunner.within(tx));
  }

  async refreshSharedCopy(): Promise<void> {
    const config = await this.readConfig({ readFrom: ReadFrom.Primary });
    await this.instanceConfigCache.set(config);
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
    await this.instanceConfigCache.setIfAbsent(config);
    return config;
  }

  // Resolved once per stored overrides in this process: parsing the env is far too slow for every read. Overrides that
  // cannot be read, or that the env schema no longer accepts (stored before a schema change), fall back to the process
  // env, as applying them always did, so one bad column never takes down every settings read.
  private resolveOverridableEnv(config: InstanceConfig): TOverridableEnvConfig {
    const version = config.envOverridesVersion();
    const cached = this.resolvedEnvCache.get(version);
    if (cached) return cached;

    let resolved: TOverridableEnvConfig;
    try {
      resolved = config.envOverrides(this.kmsRootKeyService.decryptWithRootKey()).resolve(this.processEnv);
    } catch (error) {
      logger?.error(error, "Stored env overrides cannot be applied; using the process env instead");
      resolved = EnvOverrides.none().resolve(this.processEnv);
    }
    this.resolvedEnvCache.set(version, resolved);
    return resolved;
  }
}
