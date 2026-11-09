import { TInstanceConfigEnv } from "../service/instance-config-types";

const GROUPS: TInstanceConfigEnv["overridableGroups"] = {
  google_sso: {
    name: "Google SSO",
    fields: [{ key: "CLIENT_ID_GOOGLE_LOGIN" }, { key: "CLIENT_SECRET_GOOGLE_LOGIN" }]
  },
  secretSharing: {
    name: "Secret Sharing",
    fields: [{ key: "DISABLE_PUBLIC_SECRET_SHARING", description: "Disable public secret shares" }]
  }
};

/**
 * Stands in for lib/config/env.ts: two override groups, and DISABLE_PUBLIC_SECRET_SHARING accepts only "true" or
 * "false", so a test can submit a value the schema rejects. `effective` is the env the process would read.
 */
export class FakeInstanceConfigEnv implements TInstanceConfigEnv {
  effective: Record<string, string>;

  overridableGroups = GROUPS;

  overridableKeys: ReadonlySet<string> = new Set(
    Object.values(GROUPS).flatMap(({ fields }) => fields.map(({ key }) => key))
  );

  constructor(private readonly processEnv: Record<string, string> = {}) {
    this.effective = { ...processEnv };
  }

  getConfig = () => ({ ...this.effective });

  getOriginalConfig = () => ({ ...this.processEnv });

  parseWithOverrides = (overrides: Record<string, string>) => {
    const value = { ...this.processEnv, ...overrides }.DISABLE_PUBLIC_SECRET_SHARING;
    if (value !== undefined && value !== "true" && value !== "false") {
      return {
        success: false as const,
        issues: [{ path: ["DISABLE_PUBLIC_SECRET_SHARING"], message: "Expected 'true' or 'false'" }]
      };
    }
    return { success: true as const };
  };

  overrideEnvConfig = (overrides: Record<string, string>) => {
    const allowed = Object.fromEntries(Object.entries(overrides).filter(([key]) => this.overridableKeys.has(key)));
    if (!this.parseWithOverrides(allowed).success) return;
    this.effective = { ...this.processEnv, ...allowed };
  };
}
