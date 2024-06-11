import { Logger } from "pino";
import { z } from "zod";

import { zpStr } from "../zod";

export const GITLAB_URL = "https://gitlab.com";

const zodStrBool = z
  .enum(["true", "false"])
  .optional()
  .transform((val) => val === "true");

const envSchema = z
  .object({
    PORT: z.coerce.number().default(4000),
    DISABLE_SECRET_SCANNING: z
      .enum(["true", "false"])
      .default("false")
      .transform((el) => el === "true"),
    REDIS_URL: zpStr(z.string()),
    HOST: zpStr(z.string().default("localhost")),
    DB_CONNECTION_URI: zpStr(z.string().describe("Postgres database connection string")).default(
      `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    ),
    MAX_LEASE_LIMIT: z.coerce.number().default(10000),
    DB_ROOT_CERT: zpStr(z.string().describe("Postgres database base64-encoded CA cert").optional()),
    DB_HOST: zpStr(z.string().describe("Postgres database host").optional()),
    DB_PORT: zpStr(z.string().describe("Postgres database port").optional()).default("5432"),
    DB_USER: zpStr(z.string().describe("Postgres database username").optional()),
    DB_PASSWORD: zpStr(z.string().describe("Postgres database password").optional()),
    DB_NAME: zpStr(z.string().describe("Postgres database name").optional()),

    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    SALT_ROUNDS: z.coerce.number().default(10),
    INITIAL_ORGANIZATION_NAME: zpStr(z.string().optional()),
    // TODO(akhilmhdh): will be changed to one
    ENCRYPTION_KEY: zpStr(z.string().optional()),
    ROOT_ENCRYPTION_KEY: zpStr(z.string().optional()),
    HTTPS_ENABLED: zodStrBool,
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
    COOKIE_SECRET_SIGN_KEY: z
      .string()
      .min(32)
      .default("#5VihU%rbXHcHwWwCot5L3vyPsx$7dWYw^iGk!EJg2bC*f$PD$%KCqx^R@#^LSEf"),
    SITE_URL: zpStr(z.string().optional()),
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
    // github
    CLIENT_ID_GITHUB: zpStr(z.string().optional()),
    CLIENT_SECRET_GITHUB: zpStr(z.string().optional()),
    // azure
    CLIENT_ID_AZURE: zpStr(z.string().optional()),
    CLIENT_SECRET_AZURE: zpStr(z.string().optional()),
    // gitlab
    CLIENT_ID_GITLAB: zpStr(z.string().optional()),
    CLIENT_SECRET_GITLAB: zpStr(z.string().optional()),
    URL_GITLAB_URL: zpStr(z.string().optional().default(GITLAB_URL)),
    // SECRET-SCANNING
    SECRET_SCANNING_WEBHOOK_PROXY: zpStr(z.string().optional()),
    SECRET_SCANNING_WEBHOOK_SECRET: zpStr(z.string().optional()),
    SECRET_SCANNING_GIT_APP_ID: zpStr(z.string().optional()),
    SECRET_SCANNING_PRIVATE_KEY: zpStr(z.string().optional()),
    // LICENSE
    LICENSE_SERVER_URL: zpStr(z.string().optional().default("https://portal.infisical.com")),
    LICENSE_SERVER_KEY: zpStr(z.string().optional()),
    LICENSE_KEY: zpStr(z.string().optional()),
    LICENSE_KEY_OFFLINE: zpStr(z.string().optional()),

    // GENERIC
    STANDALONE_MODE: z
      .enum(["true", "false"])
      .transform((val) => val === "true")
      .optional(),
    INFISICAL_CLOUD: zodStrBool.default("false"),
    MAINTENANCE_MODE: zodStrBool.default("false"),
    CAPTCHA_SECRET: zpStr(z.string().optional()),
    OTEL_TELEMETRY_COLLECTION_ENABLED: zodStrBool.default("false"),
    OTEL_EXPORT_OTLP_ENDPOINT: zpStr(z.string().optional()),
    OTEL_OTLP_PUSH_INTERVAL: z.coerce.number().default(30000),
    OTEL_COLLECTOR_BASIC_AUTH_USERNAME: zpStr(z.string().optional()),
    OTEL_COLLECTOR_BASIC_AUTH_PASSWORD: zpStr(z.string().optional()),
    OTEL_EXPORT_TYPE: z.enum(["prometheus", "otlp"]).optional()
  })
  .transform((data) => ({
    ...data,
    isCloud: Boolean(data.LICENSE_SERVER_KEY),
    isSmtpConfigured: Boolean(data.SMTP_HOST),
    isRedisConfigured: Boolean(data.REDIS_URL),
    isDevelopmentMode: data.NODE_ENV === "development",
    isProductionMode: data.NODE_ENV === "production",
    isSecretScanningConfigured:
      Boolean(data.SECRET_SCANNING_GIT_APP_ID) &&
      Boolean(data.SECRET_SCANNING_PRIVATE_KEY) &&
      Boolean(data.SECRET_SCANNING_WEBHOOK_SECRET),
    samlDefaultOrgSlug: data.DEFAULT_SAML_ORG_SLUG
  }));

let envCfg: Readonly<z.infer<typeof envSchema>>;

export const getConfig = () => envCfg;
// cannot import singleton logger directly as it needs config to load various transport
export const initEnvConfig = (logger: Logger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    logger.error("Invalid environment variables. Check the error below");
    logger.error(parsedEnv.error.issues);
    process.exit(-1);
  }

  envCfg = Object.freeze(parsedEnv.data);
  return envCfg;
};

export const formatSmtpConfig = () => {
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
    tls: {
      rejectUnauthorized: envCfg.SMTP_TLS_REJECT_UNAUTHORIZED
    }
  };
};
