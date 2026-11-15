import { overridableKeys, overwriteSchema, TOverridableEnvConfig } from "@app/lib/config/env";

import { TEnvOverridesRecord } from "../models/env-overrides";
import { TInstanceConfigEnv, TResolvedOverridableEnv } from "../services/dependencies";

const BOOLEAN_KEYS: ReadonlySet<string> = new Set([
  "DISABLE_POSTGRES_AUDIT_LOG_STORAGE",
  "DISABLE_AUDIT_LOG_STORAGE",
  "DISABLE_PUBLIC_SECRET_SHARING"
]);

const RADAR_KEYS = [
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_ID",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET"
];

type TOptions = {
  slackDefaults?: { clientId?: string; clientSecret?: string };
  // Keys the process env sets, for the admin console's "set in env" marker.
  envKeys?: string[];
  // Keys the env schema refuses an override for: resolving with one of them fails.
  rejectedKeys?: string[];
};

// The real resolveOverridableEnv parses the whole process env (REDIS_URL, AUTH_SECRET and more are required), which a
// unit test does not have. This one resolves the overridable keys alone, from defaults, with the same coercions for
// the keys the tests use; lib/config/env.test.ts covers the real one.
export class FakeInstanceConfigEnv implements TInstanceConfigEnv {
  readonly groups = overwriteSchema;

  readonly keys = overridableKeys;

  private readonly slack: { clientId?: string; clientSecret?: string };

  private readonly envKeys: Set<string>;

  private readonly rejectedKeys: Set<string>;

  constructor({ slackDefaults = {}, envKeys = [], rejectedKeys = [] }: TOptions = {}) {
    this.slack = slackDefaults;
    this.envKeys = new Set(envKeys);
    this.rejectedKeys = new Set(rejectedKeys);
  }

  static defaults(overrides: Partial<TOverridableEnvConfig> = {}): TOverridableEnvConfig {
    return {
      DISABLE_POSTGRES_AUDIT_LOG_STORAGE: false,
      DISABLE_AUDIT_LOG_STORAGE: undefined,
      INF_APP_CONNECTION_AWS_ACCESS_KEY_ID: undefined,
      INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY: undefined,
      INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID: undefined,
      INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: undefined,
      INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID: undefined,
      INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID: undefined,
      INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL: undefined,
      INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID: undefined,
      INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_GITHUB_APP_SLUG: undefined,
      INF_APP_CONNECTION_GITHUB_APP_ID: undefined,
      INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY: undefined,
      INF_APP_CONNECTION_GITHUB_APP_HOST: undefined,
      INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID: undefined,
      INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: undefined,
      INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: undefined,
      CLIENT_ID_GITHUB_LOGIN: undefined,
      CLIENT_SECRET_GITHUB_LOGIN: undefined,
      INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID: undefined,
      INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET: undefined,
      CLIENT_ID_GITLAB_LOGIN: undefined,
      CLIENT_SECRET_GITLAB_LOGIN: undefined,
      CLIENT_GITLAB_LOGIN_URL: "https://gitlab.com",
      CLIENT_ID_GOOGLE_LOGIN: undefined,
      CLIENT_SECRET_GOOGLE_LOGIN: undefined,
      INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: undefined,
      INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET: undefined,
      INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID: undefined,
      INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL: undefined,
      INF_APP_CONNECTION_STRIPE_SECRET_KEY: undefined,
      DISABLE_PUBLIC_SECRET_SHARING: false,
      isGithubRadarConfigured: false,
      ...overrides
    };
  }

  resolve(overrides: TEnvOverridesRecord): TResolvedOverridableEnv {
    const applied = Object.entries(overrides).filter(([key]) => overridableKeys.has(key));
    const issues = applied
      .filter(([key]) => this.rejectedKeys.has(key))
      .map(([key]) => `Key: "${key}", Error: Invalid value`);
    if (issues.length > 0) return { success: false, issues };

    const values = Object.fromEntries(
      applied.map(([key, value]) => [key, BOOLEAN_KEYS.has(key) ? value === "true" : value])
    );
    const isGithubRadarConfigured = RADAR_KEYS.every((key) => Boolean(overrides[key]));
    return {
      success: true,
      config: { ...FakeInstanceConfigEnv.defaults(), ...values, isGithubRadarConfigured }
    };
  }

  hasEnvValue(key: string) {
    return this.envKeys.has(key);
  }

  slackDefaults() {
    return this.slack;
  }
}
