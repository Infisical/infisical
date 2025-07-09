import { z } from "zod";

import { QueueWorkerProfile } from "@app/lib/types";

import { BadRequestError } from "../errors";
import { removeTrailingSlash } from "../fn";
import { CustomLogger } from "../logger/logger";
import { zpStr } from "../zod";

export const GITLAB_URL = "https://gitlab.com";

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any -- If `process.pkg` is set, and it's true, then it means that the app is currently running in a packaged environment (a binary)
export const IS_PACKAGED = (process as any)?.pkg !== undefined;

const zodStrBool = z
  .string()
  .optional()
  .transform((val) => val === "true");

const databaseReadReplicaSchema = z
  .object({
    DB_CONNECTION_URI: z.string().describe("Postgres read replica database connection string"),
    DB_ROOT_CERT: zpStr(z.string().optional().describe("Postgres read replica database certificate string"))
  })
  .array()
  .optional();

const envSchema = z
  .object({
    INFISICAL_PLATFORM_VERSION: zpStr(z.string().optional()),
    PORT: z.coerce.number().default(IS_PACKAGED ? 8080 : 4000),
    DISABLE_SECRET_SCANNING: z
      .enum(["true", "false"])
      .default("false")
      .transform((el) => el === "true"),
    REDIS_URL: zpStr(z.string().optional()),
    REDIS_SENTINEL_HOSTS: zpStr(
      z
        .string()
        .optional()
        .describe("Comma-separated list of Sentinel host:port pairs. Eg: 192.168.65.254:26379,192.168.65.254:26380")
    ),
    REDIS_SENTINEL_MASTER_NAME: zpStr(
      z.string().optional().default("mymaster").describe("The name of the Redis master set monitored by Sentinel")
    ),
    REDIS_SENTINEL_ENABLE_TLS: zodStrBool.optional().describe("Whether to use TLS/SSL for Redis Sentinel connection"),
    REDIS_SENTINEL_USERNAME: zpStr(z.string().optional().describe("Authentication username for Redis Sentinel")),
    REDIS_SENTINEL_PASSWORD: zpStr(z.string().optional().describe("Authentication password for Redis Sentinel")),
    HOST: zpStr(z.string().default("localhost")),
    DB_CONNECTION_URI: zpStr(z.string().describe("Postgres database connection string")).default(
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    ),
    AUDIT_LOGS_DB_CONNECTION_URI: zpStr(
      z.string().describe("Postgres database connection string for Audit logs").optional()
    ),
    AUDIT_LOGS_DB_ROOT_CERT: zpStr(
      z.string().describe("Postgres database base64-encoded CA cert for Audit logs").optional()
    ),
    MAX_LEASE_LIMIT: z.coerce.number().default(10000),
    DB_ROOT_CERT: zpStr(z.string().describe("Postgres database base64-encoded CA cert").optional()),
    DB_HOST: zpStr(z.string().describe("Postgres database host").optional()),
    DB_PORT: zpStr(z.string().describe("Postgres database port").optional()).default("5432"),
    DB_USER: zpStr(z.string().describe("Postgres database username").optional()),
    DB_PASSWORD: zpStr(z.string().describe("Postgres database password").optional()),
    DB_NAME: zpStr(z.string().describe("Postgres database name").optional()),
    DB_READ_REPLICAS: zpStr(z.string().describe("Postgres read replicas").optional()),
    BCRYPT_SALT_ROUND: z.number().default(12),
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    SALT_ROUNDS: z.coerce.number().default(10),
    INITIAL_ORGANIZATION_NAME: zpStr(z.string().optional()),
    // TODO(akhilmhdh): will be changed to one
    ENCRYPTION_KEY: zpStr(z.string().optional()),
    ROOT_ENCRYPTION_KEY: zpStr(z.string().optional()),
    QUEUE_WORKERS_ENABLED: zodStrBool.default("true"),
    QUEUE_WORKER_PROFILE: z.nativeEnum(QueueWorkerProfile).default(QueueWorkerProfile.All),
    HTTPS_ENABLED: zodStrBool,
    ROTATION_DEVELOPMENT_MODE: zodStrBool.default("false").optional(),
    // smtp options
    SMTP_HOST: zpStr(z.string().optional()),
    SMTP_IGNORE_TLS: zodStrBool.default("false"),
    SMTP_REQUIRE_TLS: zodStrBool.default("true"),
    SMTP_TLS_REJECT_UNAUTHORIZED: zodStrBool.default("true"),
    SMTP_PORT: z.coerce.number().default(587),
    SMTP_USERNAME: zpStr(z.string().optional()),
    SMTP_PASSWORD: zpStr(z.string().optional()),
    SMTP_FROM_ADDRESS: zpStr(z.string().optional()),
    SMTP_FROM_NAME: zpStr(z.string().optional().default("Infisical")),
    SMTP_CUSTOM_CA_CERT: zpStr(
      z.string().optional().describe("Base64 encoded custom CA certificate PEM(s) for the SMTP server")
    ),
    COOKIE_SECRET_SIGN_KEY: z
      .string()
      .min(32)
      .default("#5VihU%rbXHcHwWwCot5L3vyPsx$7dWYw^iGk!EJg2bC*f$PD$%KCqx^R@#^LSEf"),

    // Ensure that the SITE_URL never ends with a trailing slash
    SITE_URL: zpStr(z.string().transform((val) => (val ? removeTrailingSlash(val) : val))).optional(),
    // Telemetry
    TELEMETRY_ENABLED: zodStrBool.default("true"),
    POSTHOG_HOST: zpStr(z.string().optional().default("https://app.posthog.com")),
    POSTHOG_PROJECT_API_KEY: zpStr(z.string().optional().default("phc_nSin8j5q2zdhpFDI1ETmFNUIuTG4DwKVyIigrY10XiE")),
    LOOPS_API_KEY: zpStr(z.string().optional()),
    // jwt options
    AUTH_SECRET: zpStr(z.string()).default(process.env.JWT_AUTH_SECRET), // for those still using old JWT_AUTH_SECRET
    JWT_AUTH_LIFETIME: zpStr(z.string().default("10d")),
    JWT_SIGNUP_LIFETIME: zpStr(z.string().default("15m")),
    JWT_REFRESH_LIFETIME: zpStr(z.string().default("90d")),
    JWT_INVITE_LIFETIME: zpStr(z.string().default("1d")),
    JWT_MFA_LIFETIME: zpStr(z.string().default("5m")),
    JWT_PROVIDER_AUTH_LIFETIME: zpStr(z.string().default("15m")),
    // Oauth
    CLIENT_ID_GOOGLE_LOGIN: zpStr(z.string().optional()),
    CLIENT_SECRET_GOOGLE_LOGIN: zpStr(z.string().optional()),
    CLIENT_ID_GITHUB_LOGIN: zpStr(z.string().optional()),
    CLIENT_SECRET_GITHUB_LOGIN: zpStr(z.string().optional()),
    CLIENT_ID_GITLAB_LOGIN: zpStr(z.string().optional()),
    CLIENT_SECRET_GITLAB_LOGIN: zpStr(z.string().optional()),
    CLIENT_GITLAB_LOGIN_URL: zpStr(
      z
        .string()
        .optional()
        .default(process.env.URL_GITLAB_LOGIN ?? GITLAB_URL)
    ), // fallback since URL_GITLAB_LOGIN has been renamed
    DEFAULT_SAML_ORG_SLUG: zpStr(z.string().optional()).default(process.env.NEXT_PUBLIC_SAML_ORG_SLUG),
    // integration client secrets
    // heroku
    CLIENT_ID_HEROKU: zpStr(z.string().optional()),
    CLIENT_SECRET_HEROKU: zpStr(z.string().optional()),
    // vercel
    CLIENT_ID_VERCEL: zpStr(z.string().optional()),
    CLIENT_SECRET_VERCEL: zpStr(z.string().optional()),
    CLIENT_SLUG_VERCEL: zpStr(z.string().optional()),
    // netlify
    CLIENT_ID_NETLIFY: zpStr(z.string().optional()),
    CLIENT_SECRET_NETLIFY: zpStr(z.string().optional()),
    // bit bucket
    CLIENT_ID_BITBUCKET: zpStr(z.string().optional()),
    CLIENT_SECRET_BITBUCKET: zpStr(z.string().optional()),
    // gcp secret manager
    CLIENT_ID_GCP_SECRET_MANAGER: zpStr(z.string().optional()),
    CLIENT_SECRET_GCP_SECRET_MANAGER: zpStr(z.string().optional()),
    // github oauth
    CLIENT_ID_GITHUB: zpStr(z.string().optional()),
    CLIENT_SECRET_GITHUB: zpStr(z.string().optional()),
    // github app
    CLIENT_ID_GITHUB_APP: zpStr(z.string().optional()),
    CLIENT_SECRET_GITHUB_APP: zpStr(z.string().optional()),
    CLIENT_PRIVATE_KEY_GITHUB_APP: zpStr(z.string().optional()),
    CLIENT_APP_ID_GITHUB_APP: z.coerce.number().optional(),
    CLIENT_SLUG_GITHUB_APP: zpStr(z.string().optional()),

    // azure
    CLIENT_ID_AZURE: zpStr(z.string().optional()),
    CLIENT_SECRET_AZURE: zpStr(z.string().optional()),
    // aws
    CLIENT_ID_AWS_INTEGRATION: zpStr(z.string().optional()),
    CLIENT_SECRET_AWS_INTEGRATION: zpStr(z.string().optional()),
    // gitlab
    CLIENT_ID_GITLAB: zpStr(z.string().optional()),
    CLIENT_SECRET_GITLAB: zpStr(z.string().optional()),
    URL_GITLAB_URL: zpStr(z.string().optional().default(GITLAB_URL)),
    // SECRET-SCANNING
    SECRET_SCANNING_WEBHOOK_PROXY: zpStr(z.string().optional()),
    SECRET_SCANNING_WEBHOOK_SECRET: zpStr(z.string().optional()),
    SECRET_SCANNING_GIT_APP_ID: zpStr(z.string().optional()),
    SECRET_SCANNING_PRIVATE_KEY: zpStr(z.string().optional()),
    SECRET_SCANNING_ORG_WHITELIST: zpStr(z.string().optional()),
    SECRET_SCANNING_GIT_APP_SLUG: zpStr(z.string().default("infisical-radar")),
    // LICENSE
    LICENSE_SERVER_URL: zpStr(z.string().optional().default("https://portal.infisical.com")),
    LICENSE_SERVER_KEY: zpStr(z.string().optional()),
    LICENSE_KEY: zpStr(z.string().optional()),
    LICENSE_KEY_OFFLINE: zpStr(z.string().optional()),

    // GENERIC
    STANDALONE_MODE: z
      .enum(["true", "false"])
      .transform((val) => val === "true" || IS_PACKAGED)
      .optional(),
    INFISICAL_CLOUD: zodStrBool.default("false"),
    MAINTENANCE_MODE: zodStrBool.default("false"),
    CAPTCHA_SECRET: zpStr(z.string().optional()),
    CAPTCHA_SITE_KEY: zpStr(z.string().optional()),
    INTERCOM_ID: zpStr(z.string().optional()),

    // TELEMETRY
    OTEL_TELEMETRY_COLLECTION_ENABLED: zodStrBool.default("false"),
    OTEL_EXPORT_OTLP_ENDPOINT: zpStr(z.string().optional()),
    OTEL_OTLP_PUSH_INTERVAL: z.coerce.number().default(30000),
    OTEL_COLLECTOR_BASIC_AUTH_USERNAME: zpStr(z.string().optional()),
    OTEL_COLLECTOR_BASIC_AUTH_PASSWORD: zpStr(z.string().optional()),
    OTEL_EXPORT_TYPE: z.enum(["prometheus", "otlp"]).optional(),

    PYLON_API_KEY: zpStr(z.string().optional()),
    DISABLE_AUDIT_LOG_GENERATION: zodStrBool.default("false"),
    SSL_CLIENT_CERTIFICATE_HEADER_KEY: zpStr(z.string().optional()).default("x-ssl-client-cert"),
    IDENTITY_TLS_CERT_AUTH_CLIENT_CERTIFICATE_HEADER_KEY: zpStr(z.string().optional()).default(
      "x-identity-tls-cert-auth-client-cert"
    ),
    WORKFLOW_SLACK_CLIENT_ID: zpStr(z.string().optional()),
    WORKFLOW_SLACK_CLIENT_SECRET: zpStr(z.string().optional()),
    ENABLE_MSSQL_SECRET_ROTATION_ENCRYPT: zodStrBool.default("true"),

    // HSM
    HSM_LIB_PATH: zpStr(z.string().optional()),
    HSM_PIN: zpStr(z.string().optional()),
    HSM_KEY_LABEL: zpStr(z.string().optional()),
    HSM_SLOT: z.coerce.number().optional().default(0),

    USE_PG_QUEUE: zodStrBool.default("false"),
    SHOULD_INIT_PG_QUEUE: zodStrBool.default("false"),

    /* Gateway----------------------------------------------------------------------------- */
    GATEWAY_INFISICAL_STATIC_IP_ADDRESS: zpStr(z.string().optional()),
    GATEWAY_RELAY_ADDRESS: zpStr(z.string().optional()),
    GATEWAY_RELAY_REALM: zpStr(z.string().optional()),
    GATEWAY_RELAY_AUTH_SECRET: zpStr(z.string().optional()),

    DYNAMIC_SECRET_ALLOW_INTERNAL_IP: zodStrBool.default("false"),
    DYNAMIC_SECRET_AWS_ACCESS_KEY_ID: zpStr(z.string().optional()).default(
      process.env.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID
    ),
    DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY: zpStr(z.string().optional()).default(
      process.env.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
    ),
    /* ----------------------------------------------------------------------------- */

    /* App Connections ----------------------------------------------------------------------------- */
    ALLOW_INTERNAL_IP_CONNECTIONS: zodStrBool.default("false"),

    // aws
    INF_APP_CONNECTION_AWS_ACCESS_KEY_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY: zpStr(z.string().optional()),

    // github oauth
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET: zpStr(z.string().optional()),

    // github app
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_APP_SLUG: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_APP_ID: zpStr(z.string().optional()),

    // github radar app
    INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: zpStr(z.string().optional()),

    // gitlab oauth
    INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET: zpStr(z.string().optional()),

    // gcp app
    INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL: zpStr(z.string().optional()),

    // azure app
    INF_APP_CONNECTION_AZURE_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_CLIENT_SECRET: zpStr(z.string().optional()),

    // datadog
    SHOULD_USE_DATADOG_TRACER: zodStrBool.default("false"),
    DATADOG_PROFILING_ENABLED: zodStrBool.default("false"),
    DATADOG_ENV: zpStr(z.string().optional().default("prod")),
    DATADOG_SERVICE: zpStr(z.string().optional().default("infisical-core")),
    DATADOG_HOSTNAME: zpStr(z.string().optional()),

    // PIT
    PIT_CHECKPOINT_WINDOW: zpStr(z.string().optional().default("100")),
    PIT_TREE_CHECKPOINT_WINDOW: zpStr(z.string().optional().default("200")),

    /* CORS ----------------------------------------------------------------------------- */
    CORS_ALLOWED_ORIGINS: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return undefined;
          return JSON.parse(val) as string[];
        })
    ),
    CORS_ALLOWED_HEADERS: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return undefined;
          return JSON.parse(val) as string[];
        })
    ),

    /* INTERNAL ----------------------------------------------------------------------------- */
    INTERNAL_REGION: zpStr(z.enum(["us", "eu"]).optional())
  })
  // To ensure that basic encryption is always possible.
  .refine(
    (data) => Boolean(data.ENCRYPTION_KEY) || Boolean(data.ROOT_ENCRYPTION_KEY),
    "Either ENCRYPTION_KEY or ROOT_ENCRYPTION_KEY must be defined."
  )
  .refine(
    (data) => Boolean(data.REDIS_URL) || Boolean(data.REDIS_SENTINEL_HOSTS),
    "Either REDIS_URL or REDIS_SENTINEL_HOSTS must be defined."
  )
  .transform((data) => ({
    ...data,
    DB_READ_REPLICAS: data.DB_READ_REPLICAS
      ? databaseReadReplicaSchema.parse(JSON.parse(data.DB_READ_REPLICAS))
      : undefined,
    isCloud: Boolean(data.LICENSE_SERVER_KEY),
    isSmtpConfigured: Boolean(data.SMTP_HOST),
    isRedisConfigured: Boolean(data.REDIS_URL || data.REDIS_SENTINEL_HOSTS),
    isDevelopmentMode: data.NODE_ENV === "development",
    isRotationDevelopmentMode: data.NODE_ENV === "development" && data.ROTATION_DEVELOPMENT_MODE,
    isProductionMode: data.NODE_ENV === "production" || IS_PACKAGED,
    isRedisSentinelMode: Boolean(data.REDIS_SENTINEL_HOSTS),
    REDIS_SENTINEL_HOSTS: data.REDIS_SENTINEL_HOSTS?.trim()
      ?.split(",")
      .map((el) => {
        const [host, port] = el.trim().split(":");
        return { host: host.trim(), port: Number(port.trim()) };
      }),
    isSecretScanningConfigured:
      Boolean(data.SECRET_SCANNING_GIT_APP_ID) &&
      Boolean(data.SECRET_SCANNING_PRIVATE_KEY) &&
      Boolean(data.SECRET_SCANNING_WEBHOOK_SECRET),
    isSecretScanningV2Configured:
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_ID) &&
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY) &&
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG) &&
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID) &&
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET) &&
      Boolean(data.INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET),
    isHsmConfigured:
      Boolean(data.HSM_LIB_PATH) && Boolean(data.HSM_PIN) && Boolean(data.HSM_KEY_LABEL) && data.HSM_SLOT !== undefined,
    samlDefaultOrgSlug: data.DEFAULT_SAML_ORG_SLUG,
    SECRET_SCANNING_ORG_WHITELIST: data.SECRET_SCANNING_ORG_WHITELIST?.split(",")
  }));

export type TEnvConfig = Readonly<z.infer<typeof envSchema>>;
let envCfg: TEnvConfig;
let originalEnvConfig: TEnvConfig;

export const getConfig = () => envCfg;
export const getOriginalConfig = () => originalEnvConfig;

// cannot import singleton logger directly as it needs config to load various transport
export const initEnvConfig = (logger?: CustomLogger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    (logger ?? console).error("Invalid environment variables. Check the error below");
    (logger ?? console).error(parsedEnv.error.issues);
    process.exit(-1);
  }

  const config = Object.freeze(parsedEnv.data);
  envCfg = config;

  if (!originalEnvConfig) {
    originalEnvConfig = config;
  }

  return envCfg;
};

// A list of environment variables that can be overwritten
export const overwriteSchema: {
  [key: string]: {
    name: string;
    fields: { key: keyof TEnvConfig; description?: string }[];
  };
} = {
  azure: {
    name: "Azure",
    fields: [
      {
        key: "INF_APP_CONNECTION_AZURE_CLIENT_ID",
        description: "The Application (Client) ID of your Azure application."
      },
      {
        key: "INF_APP_CONNECTION_AZURE_CLIENT_SECRET",
        description: "The Client Secret of your Azure application."
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
  }
};

export const overridableKeys = new Set(
  Object.values(overwriteSchema).flatMap(({ fields }) => fields.map(({ key }) => key))
);

export const validateOverrides = (config: Record<string, string>) => {
  const allowedOverrides = Object.fromEntries(
    Object.entries(config).filter(([key]) => overridableKeys.has(key as keyof z.input<typeof envSchema>))
  );

  const tempEnv: Record<string, unknown> = { ...process.env, ...allowedOverrides };
  const parsedResult = envSchema.safeParse(tempEnv);

  if (!parsedResult.success) {
    const errorDetails = parsedResult.error.issues
      .map((issue) => `Key: "${issue.path.join(".")}", Error: ${issue.message}`)
      .join("\n");
    throw new BadRequestError({ message: errorDetails });
  }
};

export const overrideEnvConfig = (config: Record<string, string>) => {
  const allowedOverrides = Object.fromEntries(
    Object.entries(config).filter(([key]) => overridableKeys.has(key as keyof z.input<typeof envSchema>))
  );

  const tempEnv: Record<string, unknown> = { ...process.env, ...allowedOverrides };
  const parsedResult = envSchema.safeParse(tempEnv);

  if (parsedResult.success) {
    envCfg = Object.freeze(parsedResult.data);
  }
};

export const formatSmtpConfig = () => {
  const tlsOptions: {
    rejectUnauthorized: boolean;
    ca?: string | string[];
  } = {
    rejectUnauthorized: envCfg.SMTP_TLS_REJECT_UNAUTHORIZED
  };

  if (envCfg.SMTP_CUSTOM_CA_CERT) {
    tlsOptions.ca = Buffer.from(envCfg.SMTP_CUSTOM_CA_CERT, "base64").toString("utf-8");
  }

  return {
    host: envCfg.SMTP_HOST,
    port: envCfg.SMTP_PORT,
    auth:
      envCfg.SMTP_USERNAME && envCfg.SMTP_PASSWORD
        ? { user: envCfg.SMTP_USERNAME, pass: envCfg.SMTP_PASSWORD }
        : undefined,
    secure: envCfg.SMTP_PORT === 465,
    from: `"${envCfg.SMTP_FROM_NAME}" <${envCfg.SMTP_FROM_ADDRESS}>`,
    ignoreTLS: envCfg.SMTP_IGNORE_TLS,
    requireTLS: envCfg.SMTP_REQUIRE_TLS,
    tls: tlsOptions
  };
};
