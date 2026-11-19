import { TOverridableEnvConfig } from "../models/env-overrides";
import { TResolvedEnvCache } from "../services/dependencies";

// One entry: the stored overrides change rarely, and every pod holds the same ones.
export class ResolvedEnvCache implements TResolvedEnvCache {
  private entry: { version: string; config: TOverridableEnvConfig } | null = null;

  get(version: string): TOverridableEnvConfig | null {
    return this.entry?.version === version ? this.entry.config : null;
  }

  set(version: string, config: TOverridableEnvConfig): void {
    this.entry = { version, config };
  }
}
