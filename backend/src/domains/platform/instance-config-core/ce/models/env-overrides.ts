import { z } from "zod";

import { RuleViolationError } from "@app/domains/lib/errors";
import { zpStr } from "@app/lib/zod";

export type TEnvOverridesRecord = Record<string, string>;

// The process env as the server started.
export type TProcessEnv = Readonly<Record<string, string | undefined>>;

export type TOrganizedEnvOverrides = Record<
  string,
  { name: string; fields: { key: string; value: string; hasEnvEntry: boolean; description?: string }[] }
>;

const GITLAB_URL = "https://gitlab.com";

// The env values an instance admin can override, grouped as the admin console lists them.
const OVERRIDE_GROUPS = {
  auditLogs: {
    name: "Audit Logs",
    fields: [
      {
        key: "DISABLE_POSTGRES_AUDIT_LOG_STORAGE",
        description: "Disable PostgreSQL audit log storage"
      },
      {
        key: "DISABLE_AUDIT_LOG_STORAGE",
        description: "Legacy alias for DISABLE_POSTGRES_AUDIT_LOG_STORAGE (deprecated)"
      }
    ]
  },
  aws: {
    name: "AWS",
    fields: [
      {
        key: "INF_APP_CONNECTION_AWS_ACCESS_KEY_ID",
        description: "The Access Key ID of your AWS account."
      },
      {
        key: "INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY",
        description: "The Client Secret of your AWS application."
      }
    ]
  },
  azureAppConfiguration: {
    name: "Azure App Connection: App Configuration",
    fields: [
      {
        key: "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID",
        description: "The Application (Client) ID of your Azure application."
      },
      {
        key: "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET",
        description: "The Client Secret of your Azure application."
      }
    ]
  },
  azureKeyVault: {
    name: "Azure App Connection: Key Vault",
    fields: [
      {
        key: "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID",
        description: "The Application (Client) ID of your Azure application."
      },
      {
        key: "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET",
        description: "The Client Secret of your Azure application."
      }
    ]
  },
  azureClientSecrets: {
    name: "Azure App Connection: Client Secrets",
    fields: [
      {
        key: "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID",
        description: "The Application (Client) ID of your Azure application."
      },
      {
        key: "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET",
        description: "The Client Secret of your Azure application."
      }
    ]
  },
  azureDevOps: {
    name: "Azure App Connection: DevOps",
    fields: [
      {
        key: "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID",
        description: "The Application (Client) ID of your Azure application."
      },
      {
        key: "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET",
        description: "The Client Secret of your Azure application."
      }
    ]
  },
  gcp: {
    name: "GCP",
    fields: [
      {
        key: "INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL",
        description:
          'The GCP credentials JSON used as the impersonation source. Accepts either a service account key (type "service_account") or a workload identity federation config (type "external_account"). For external_account, the referenced credential source (file, URL, or metadata endpoint) must be reachable from the instance.'
      }
    ]
  },
  github_app: {
    name: "GitHub App",
    fields: [
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID",
        description: "The Client ID of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET",
        description: "The Client Secret of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_SLUG",
        description: "The Slug of your GitHub application. This is the one found in the URL."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_ID",
        description: "The App ID of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY",
        description: "The Private Key of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_APP_HOST",
        description:
          "The hostname of the GitHub instance used by the shared GitHub App (e.g. github.example.com for GitHub Enterprise Server). Defaults to github.com. Must be set when the shared app is registered on a GHES instance."
      }
    ]
  },
  github_oauth: {
    name: "GitHub OAuth",
    fields: [
      {
        key: "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID",
        description: "The Client ID of your GitHub OAuth application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET",
        description: "The Client Secret of your GitHub OAuth application."
      }
    ]
  },
  github_radar_app: {
    name: "GitHub Radar App",
    fields: [
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID",
        description: "The Client ID of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET",
        description: "The Client Secret of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG",
        description: "The Slug of your GitHub application. This is the one found in the URL."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_ID",
        description: "The App ID of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY",
        description: "The Private Key of your GitHub application."
      },
      {
        key: "INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET",
        description: "The Webhook Secret of your GitHub application."
      }
    ]
  },
  github_sso: {
    name: "GitHub SSO",
    fields: [
      {
        key: "CLIENT_ID_GITHUB_LOGIN",
        description: "The Client ID of your GitHub OAuth application."
      },
      {
        key: "CLIENT_SECRET_GITHUB_LOGIN",
        description: "The Client Secret of your GitHub OAuth application."
      }
    ]
  },
  gitlab_oauth: {
    name: "GitLab OAuth",
    fields: [
      {
        key: "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID",
        description: "The Client ID of your GitLab OAuth application."
      },
      {
        key: "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET",
        description: "The Client Secret of your GitLab OAuth application."
      }
    ]
  },
  gitlab_sso: {
    name: "GitLab SSO",
    fields: [
      {
        key: "CLIENT_ID_GITLAB_LOGIN",
        description: "The Client ID of your GitLab application."
      },
      {
        key: "CLIENT_SECRET_GITLAB_LOGIN",
        description: "The Secret of your GitLab application."
      },
      {
        key: "CLIENT_GITLAB_LOGIN_URL",
        description:
          "The URL of your self-hosted instance of GitLab where the OAuth application is registered. If no URL is passed in, this will default to https://gitlab.com."
      }
    ]
  },
  google_sso: {
    name: "Google SSO",
    fields: [
      {
        key: "CLIENT_ID_GOOGLE_LOGIN",
        description: "The Client ID of your GCP OAuth2 application."
      },
      {
        key: "CLIENT_SECRET_GOOGLE_LOGIN",
        description: "The Client Secret of your GCP OAuth2 application."
      }
    ]
  },
  heroku: {
    name: "Heroku",
    fields: [
      {
        key: "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID",
        description: "The Client ID of your Heroku application."
      },
      {
        key: "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET",
        description: "The Client Secret of your Heroku application."
      }
    ]
  },
  stripe: {
    name: "Stripe",
    fields: [
      {
        key: "INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID",
        description: "The Client ID of your Stripe app."
      },
      {
        key: "INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL",
        description:
          "Optional. Overrides the Stripe App Marketplace install link, which is otherwise derived from the Client ID above. Set it to the test-mode or sandbox link from the Stripe dashboard when the secret key below is not a live-mode key."
      },
      {
        key: "INF_APP_CONNECTION_STRIPE_SECRET_KEY",
        description:
          "The secret API key of the Stripe account that owns your Stripe app. Infisical authenticates as this account and names the customer's account with Stripe-Context."
      }
    ]
  },
  secretSharing: {
    name: "Secret Sharing",
    fields: [
      {
        key: "DISABLE_PUBLIC_SECRET_SHARING",
        description:
          "Disable creation of unauthenticated public secret shares (the /share-secret page). Set to 'true' to block public sharing."
      }
    ]
  }
} as const satisfies Record<string, { name: string; fields: readonly { key: string; description?: string }[] }>;

type TOverridableKey = (typeof OVERRIDE_GROUPS)[keyof typeof OVERRIDE_GROUPS]["fields"][number]["key"];

const optionalString = zpStr(z.string().optional());
const stringBool = z
  .string()
  .optional()
  .transform((val) => val === "true");

// Every overridable value plus the env values that only back one of them (the shared Azure app, the legacy Heroku
// app, the renamed GitLab URL). Each parses as the server has always read it, so an override behaves like the env value.
const OVERRIDABLE_ENV_SCHEMA = z
  .object({
    INF_APP_CONNECTION_AWS_ACCESS_KEY_ID: optionalString,
    INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY: optionalString,
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_SLUG: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_ID: optionalString,
    INF_APP_CONNECTION_GITHUB_APP_HOST: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: optionalString,
    INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: optionalString,
    INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL: optionalString,
    INF_APP_CONNECTION_AZURE_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET: optionalString,
    INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID: optionalString,
    INF_APP_CONNECTION_STRIPE_SECRET_KEY: optionalString,
    INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL: optionalString,
    CLIENT_ID_GOOGLE_LOGIN: optionalString,
    CLIENT_SECRET_GOOGLE_LOGIN: optionalString,
    CLIENT_ID_GITHUB_LOGIN: optionalString,
    CLIENT_SECRET_GITHUB_LOGIN: optionalString,
    CLIENT_ID_GITLAB_LOGIN: optionalString,
    CLIENT_SECRET_GITLAB_LOGIN: optionalString,
    CLIENT_ID_HEROKU: optionalString,
    CLIENT_SECRET_HEROKU: optionalString,
    URL_GITLAB_LOGIN: z.string().optional(),
    CLIENT_GITLAB_LOGIN_URL: optionalString,
    DISABLE_AUDIT_LOG_STORAGE: stringBool.optional(),
    DISABLE_POSTGRES_AUDIT_LOG_STORAGE: z
      .string()
      .optional()
      .transform((val) => (val === undefined ? undefined : val === "true")),
    DISABLE_PUBLIC_SECRET_SHARING: stringBool.default("false")
  })
  .transform(
    (data) =>
      ({
        DISABLE_POSTGRES_AUDIT_LOG_STORAGE:
          data.DISABLE_POSTGRES_AUDIT_LOG_STORAGE ?? data.DISABLE_AUDIT_LOG_STORAGE ?? false,
        DISABLE_AUDIT_LOG_STORAGE: data.DISABLE_AUDIT_LOG_STORAGE,
        INF_APP_CONNECTION_AWS_ACCESS_KEY_ID: data.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID,
        INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY: data.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY,
        INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID:
          data.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
        INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET:
          data.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
        INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID:
          data.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
        INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET:
          data.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
        INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID:
          data.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
        INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET:
          data.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
        INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID:
          data.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
        INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET:
          data.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
        INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL: data.INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL,
        INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID: data.INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID,
        INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET: data.INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET,
        INF_APP_CONNECTION_GITHUB_APP_SLUG: data.INF_APP_CONNECTION_GITHUB_APP_SLUG,
        INF_APP_CONNECTION_GITHUB_APP_ID: data.INF_APP_CONNECTION_GITHUB_APP_ID,
        INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY: data.INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY,
        INF_APP_CONNECTION_GITHUB_APP_HOST: data.INF_APP_CONNECTION_GITHUB_APP_HOST,
        INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID: data.INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID,
        INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET: data.INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY,
        INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: data.INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET,
        CLIENT_ID_GITHUB_LOGIN: data.CLIENT_ID_GITHUB_LOGIN,
        CLIENT_SECRET_GITHUB_LOGIN: data.CLIENT_SECRET_GITHUB_LOGIN,
        INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID: data.INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID,
        INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET: data.INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET,
        CLIENT_ID_GITLAB_LOGIN: data.CLIENT_ID_GITLAB_LOGIN,
        CLIENT_SECRET_GITLAB_LOGIN: data.CLIENT_SECRET_GITLAB_LOGIN,
        CLIENT_GITLAB_LOGIN_URL: data.CLIENT_GITLAB_LOGIN_URL ?? data.URL_GITLAB_LOGIN ?? GITLAB_URL,
        CLIENT_ID_GOOGLE_LOGIN: data.CLIENT_ID_GOOGLE_LOGIN,
        CLIENT_SECRET_GOOGLE_LOGIN: data.CLIENT_SECRET_GOOGLE_LOGIN,
        INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID:
          data.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID || data.CLIENT_ID_HEROKU,
        INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET:
          data.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET || data.CLIENT_SECRET_HEROKU,
        INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID: data.INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID,
        INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL: data.INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL,
        INF_APP_CONNECTION_STRIPE_SECRET_KEY: data.INF_APP_CONNECTION_STRIPE_SECRET_KEY,
        DISABLE_PUBLIC_SECRET_SHARING: data.DISABLE_PUBLIC_SECRET_SHARING,
        isGithubRadarConfigured:
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID) &&
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY) &&
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG) &&
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID) &&
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET) &&
          Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET)
      }) satisfies Record<TOverridableKey | "isGithubRadarConfigured", unknown>
  );

// The overridable env values as the server uses them: stored overrides on top of the process env.
export type TOverridableEnvConfig = z.output<typeof OVERRIDABLE_ENV_SCHEMA>;

const readableIssues = (error: z.ZodError) =>
  error.issues.map((issue) => `Key: "${issue.path.join(".")}", Error: ${issue.message}`).join("\n");

// The env values an instance admin set, by env name. Only keys an admin can override are kept.
export class EnvOverrides {
  static readonly KEYS: readonly string[] = Object.values(OVERRIDE_GROUPS).flatMap(({ fields }) =>
    fields.map(({ key }) => key)
  );

  private constructor(private readonly values: Readonly<TEnvOverridesRecord>) {}

  static none(): EnvOverrides {
    return new EnvOverrides({});
  }

  // Refuses values the schema rejects. Keys an admin cannot override are dropped.
  static create(raw: TEnvOverridesRecord): EnvOverrides {
    const values = EnvOverrides.onlyOverridable(raw);
    const parsed = OVERRIDABLE_ENV_SCHEMA.safeParse(values);
    if (!parsed.success) throw new RuleViolationError({ message: readableIssues(parsed.error) });
    return new EnvOverrides(values);
  }

  // Stored keys an admin cannot override are dropped here too: the schema also reads the values only they fall back to
  // (the shared Azure app, the legacy Heroku app, URL_GITLAB_LOGIN), and a stored one must never replace the env's.
  static restore(record: TEnvOverridesRecord): EnvOverrides {
    return new EnvOverrides(EnvOverrides.onlyOverridable(record));
  }

  // The stored form: the JSON object, as every release has written it.
  static fromBytes(plainText: Buffer): EnvOverrides {
    return EnvOverrides.restore(JSON.parse(plainText.toString()) as TEnvOverridesRecord);
  }

  toBytes(): Buffer {
    return Buffer.from(JSON.stringify(this.values));
  }

  // These overrides on top of the process env, with the schema's coercion, defaults and fallbacks applied.
  resolve(processEnv: TProcessEnv): TOverridableEnvConfig {
    const parsed = OVERRIDABLE_ENV_SCHEMA.safeParse({ ...processEnv, ...this.values });
    if (!parsed.success) throw new RuleViolationError({ message: readableIssues(parsed.error) });
    return parsed.data;
  }

  // The admin console's view: every overridable key by group, with its override ("" when none) and whether the
  // process env alone sets it.
  organize(processEnv: TProcessEnv): TOrganizedEnvOverrides {
    const fromEnv: Readonly<Record<string, unknown>> = EnvOverrides.none().resolve(processEnv);
    return Object.fromEntries(
      Object.entries(OVERRIDE_GROUPS).map(([groupKey, group]) => [
        groupKey,
        {
          name: group.name,
          fields: group.fields.map(({ key, description }) => ({
            key,
            description,
            value: this.values[key] || "",
            hasEnvEntry: Boolean(fromEnv[key])
          }))
        }
      ])
    );
  }

  toJSON(): TEnvOverridesRecord {
    return { ...this.values };
  }

  private static onlyOverridable(record: TEnvOverridesRecord): TEnvOverridesRecord {
    return Object.fromEntries(Object.entries(record).filter(([key]) => EnvOverrides.KEYS.includes(key)));
  }
}
