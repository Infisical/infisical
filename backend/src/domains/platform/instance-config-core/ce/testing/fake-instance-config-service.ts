import { randomUUID } from "node:crypto";

import { TReadOptions } from "@app/domains/lib/data-access";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";

import { InstanceConfigCache } from "../data-access/instance-config-cache";
import { ResolvedEnvCache } from "../data-access/resolved-env-cache";
import { EnvOverrides, TOverridableEnvConfig } from "../models/env-overrides";
import { TGitHubAppCredentialsRecord } from "../models/github-app-credentials";
import { INSTANCE_CONFIG_ID, InstanceConfig, TInstanceConfigSettings } from "../models/instance-config";
import { TMicrosoftTeamsAppCredentialsRecord } from "../models/microsoft-teams-app-credentials";
import { TSlackAppCredentialsRecord } from "../models/slack-app-credentials";
import {
  InstanceConfigService,
  TInstanceConfigPatch,
  TInstanceConfigService
} from "../services/instance-config/service";
import { InMemoryInstanceConfigStores } from "./in-memory-instance-config-stores";

type TOptions = {
  settings?: Partial<TInstanceConfigSettings>;
  env?: Partial<TOverridableEnvConfig>;
  slack?: TSlackAppCredentialsRecord;
  microsoftTeams?: TMicrosoftTeamsAppCredentialsRecord;
  gitHubApp?: TGitHubAppCredentialsRecord;
};

const asSsoMethod = (method: string | null | undefined) => (method === "saml" || method === "oidc" ? method : null);

/**
 * For consumers of Instance Config Core: the real service over one in-memory row and KMS Core's fake root key, ready as
 * soon as it is constructed. Pass the settings, overridable env values and credentials a test needs; the rest are the
 * defaults of a fresh instance. Overridable env values are fixed to `env` (the fake ignores stored overrides), so a
 * test of the overrides themselves builds Instance Config Core instead.
 */
export class FakeInstanceConfigService implements TInstanceConfigService {
  readonly memory = new InMemoryInstanceConfigStores();

  private readonly service: TInstanceConfigService;

  private readonly env: TOverridableEnvConfig;

  constructor({ settings = {}, env = {}, slack, microsoftTeams, gitHubApp }: TOptions = {}) {
    const { kmsRootKeyService } = new FakeKmsCore();
    const encrypt = kmsRootKeyService.encryptWithRootKey();
    const now = new Date();
    this.env = { ...EnvOverrides.none().resolve({}), ...env };

    const config = InstanceConfig.restore({
      id: INSTANCE_CONFIG_ID,
      instanceId: randomUUID(),
      initialized: false,
      allowSignUp: true,
      fipsEnabled: false,
      onboardingCompleted: false,
      createdAt: now,
      updatedAt: now,
      ...settings
    });
    config.changeSlackCredentials(
      { clientId: slack?.clientId || undefined, clientSecret: slack?.clientSecret || undefined },
      encrypt
    );
    config.changeMicrosoftTeamsCredentials(
      {
        appId: microsoftTeams?.appId || undefined,
        clientSecret: microsoftTeams?.clientSecret || undefined,
        botId: microsoftTeams?.botId || undefined
      },
      encrypt
    );
    config.changeGitHubAppCredentials(
      {
        clientId: gitHubApp?.clientId,
        clientSecret: gitHubApp?.clientSecret,
        appSlug: gitHubApp?.appSlug,
        appId: gitHubApp?.appId,
        privateKey: gitHubApp?.privateKey
      },
      encrypt
    );
    this.memory.instanceConfigStore.seed(config);
    if (settings.defaultAuthOrgId) {
      this.memory.instanceConfigStore.addOrg({
        id: settings.defaultAuthOrgId,
        slug: settings.defaultAuthOrgSlug ?? "",
        authEnforced: settings.defaultAuthOrgAuthEnforced ?? false,
        authMethod: asSsoMethod(settings.defaultAuthOrgAuthMethod)
      });
    }

    this.service = new InstanceConfigService(
      this.memory.transactionRunner,
      this.memory.instanceConfigStore,
      new InstanceConfigCache(new InMemoryKeyStore()),
      new ResolvedEnvCache(),
      kmsRootKeyService,
      {}
    );
  }

  getInstanceConfig = async () => ({ ...(await this.service.getInstanceConfig()), ...this.env });

  isInstanceAdminIdentity = (identityId: string) => this.service.isInstanceAdminIdentity(identityId);

  getSlackCredentials = () => this.service.getSlackCredentials();

  getMicrosoftTeamsCredentials = (options?: TReadOptions) => this.service.getMicrosoftTeamsCredentials(options);

  getIntegrationCredentials = () => this.service.getIntegrationCredentials();

  getEnvOverridesOrganized = () => this.service.getEnvOverridesOrganized();

  updateConfig = (patch: TInstanceConfigPatch) => this.service.updateConfig(patch);

  completeSetup = (input: { closeSignUp: boolean; adminIdentityId?: string }) => this.service.completeSetup(input);

  revokeAdminIdentity = (identityId: string) => this.service.revokeAdminIdentity(identityId);
}
