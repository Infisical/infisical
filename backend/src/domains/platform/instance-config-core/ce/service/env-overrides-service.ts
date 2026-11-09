import { NotFoundError } from "@app/lib/errors";

import { TInstanceConfigCoreDataAccess } from "../data-access/instance-config-core-data-access";
import { decryptEnvOverrides } from "./instance-config-fns";
import { TEnvOverridesView, TInstanceConfigEnv, TRootKeyCipher } from "./instance-config-types";

export type TEnvOverridesServiceDeps = {
  dataAccess: TInstanceConfigCoreDataAccess;
  kmsCoreDomain: TRootKeyCipher;
  env: TInstanceConfigEnv;
};

// Env values an instance admin stored in super_admin. They are applied on top of the process env in every pod's
// env holder, so code reads them through lib/config/env.ts getConfig() like any env value.
export class EnvOverridesService {
  constructor(private readonly deps: TEnvOverridesServiceDeps) {}

  async getEnvOverrides(): Promise<Record<string, string>> {
    const config = await this.deps.dataAccess.instanceConfig.findById();
    if (!config) throw new NotFoundError({ message: "Admin config not found" });
    return decryptEnvOverrides(config, this.deps.kmsCoreDomain);
  }

  async getEnvOverridesOrganized(): Promise<TEnvOverridesView> {
    const overrides = await this.getEnvOverrides();
    const original = (this.deps.env.getOriginalConfig() ?? {}) as Record<string, unknown>;
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
  async syncNow(): Promise<void> {
    const overrides = await this.getEnvOverrides();
    this.deps.env.overrideEnvConfig(overrides);
  }
}
