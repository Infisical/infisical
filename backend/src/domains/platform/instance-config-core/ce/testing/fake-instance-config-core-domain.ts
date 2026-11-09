import { TInstanceConfigCoreDomain, TInstanceConfigPatch } from "../module";
import { buildInMemoryInstanceConfigCore } from "./build-instance-config-core";

/**
 * For consumers of Instance Config Core: the real domain over in-memory data access, with the row already created.
 * Pass the settings a test needs (`adminIdentityIds`, `allowSignUp`, ...) to the constructor.
 */
export class FakeInstanceConfigCoreDomain implements TInstanceConfigCoreDomain {
  readonly built = buildInMemoryInstanceConfigCore();

  private readonly ready: Promise<void>;

  constructor(settings: TInstanceConfigPatch = {}) {
    this.ready = (async () => {
      await this.built.module.initialize();
      if (Object.keys(settings).length > 0) await this.built.config.updateConfig(settings);
    })();
  }

  getServerConfig = this.delegate("getServerConfig");

  getAdminIdentityIds = this.delegate("getAdminIdentityIds");

  updateConfig = this.delegate("updateConfig");

  getSlackCredentials = this.delegate("getSlackCredentials");

  getMicrosoftTeamsCredentials = this.delegate("getMicrosoftTeamsCredentials");

  getIntegrationCredentials = this.delegate("getIntegrationCredentials");

  getEnvOverrides = this.delegate("getEnvOverrides");

  getEnvOverridesOrganized = this.delegate("getEnvOverridesOrganized");

  private delegate<K extends keyof TInstanceConfigCoreDomain>(method: K): TInstanceConfigCoreDomain[K] {
    return (async (...args: unknown[]) => {
      await this.ready;
      return (this.built.config[method] as (...a: unknown[]) => Promise<unknown>)(...args);
    }) as TInstanceConfigCoreDomain[K];
  }
}
