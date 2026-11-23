import { randomUUID } from "node:crypto";

import { TReadOptions } from "@app/domains/lib/data-access";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";

import { InstanceConfigCache } from "../data-access/instance-config-cache";
import { ResolvedEnvCache } from "../data-access/resolved-env-cache";
import { EnvOverrides, TOverridableEnvConfig } from "../models/env-overrides";
import { INSTANCE_CONFIG_ID, InstanceConfig, TInstanceConfigSettings } from "../models/instance-config";
import { InstanceConfigTransaction } from "../services/instance-config/instance-config-transaction";
import {
  InstanceConfigService,
  TInstanceConfigPatch,
  TInstanceConfigService
} from "../services/instance-config/service";
import { InMemoryInstanceConfigStores } from "./in-memory-instance-config-stores";

type TOptions = {
  settings?: Partial<TInstanceConfigSettings>;
  env?: Partial<TOverridableEnvConfig>;
};

/**
 * For consumers of Instance Config Core: the real service over one in-memory row and KMS Core's fake root key, ready as
 * soon as it is constructed. Pass the settings and overridable env values a test needs; the rest are the defaults of
 * a fresh instance. Overridable env values are fixed to `env` (the fake ignores stored overrides), so a
 * test of the overrides themselves builds Instance Config Core instead.
 */
export class FakeInstanceConfigService implements TInstanceConfigService {
  private readonly memory = new InMemoryInstanceConfigStores();

  private readonly service: TInstanceConfigService;

  private readonly env: TOverridableEnvConfig;

  constructor({ settings = {}, env = {} }: TOptions = {}) {
    const { kmsRootKeyService } = new FakeKmsCore();
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
    this.memory.instanceConfigStore.seed(config);

    this.service = new InstanceConfigService(
      this.memory.transactionRunner,
      this.memory.instanceConfigStore,
      new InstanceConfigCache(new InMemoryKeyStore()),
      new ResolvedEnvCache(),
      kmsRootKeyService,
      {}
    );
  }

  getSettings = () => this.service.getSettings();

  getOverridableEnv = async () => this.env;

  getLoginPolicy = () => this.service.getLoginPolicy();

  getSignUpPolicy = () => this.service.getSignUpPolicy();

  isInstanceAdminIdentity = (identityId: string) => this.service.isInstanceAdminIdentity(identityId);

  getSlackCredentials = () => this.service.getSlackCredentials();

  getMicrosoftTeamsCredentials = (options?: TReadOptions) => this.service.getMicrosoftTeamsCredentials(options);

  getIntegrationCredentials = () => this.service.getIntegrationCredentials();

  getEnvOverridesOrganized = () => this.service.getEnvOverridesOrganized();

  updateConfig = (patch: TInstanceConfigPatch) => this.service.updateConfig(patch);

  revokeAdminIdentity = (identityId: string) => this.service.revokeAdminIdentity(identityId);

  // The in-memory state has one transaction to join, so a consumer's test may hand in any transaction.
  within = () => new InstanceConfigTransaction(this.memory.transactionRunner);

  refreshSharedCopy = () => this.service.refreshSharedCopy();
}
