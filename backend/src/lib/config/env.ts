import { z } from "zod";

import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { crypto } from "@app/lib/crypto/cryptography";
import { QueueWorkerProfile } from "@app/lib/types";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";

import { BadRequestError } from "../errors";
import { removeTrailingSlash } from "../fn";
import { CustomLogger } from "../logger/logger";
import { zpStr } from "../zod";

export const GITLAB_URL = "https://gitlab.com";

const DEFAULT_CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS: Record<string, string | number | boolean> = {
  async_insert: 1,
  // !!!NOTICE!!! by disabling wait_for_async_insert, we shouldn't suffer from the audit log queue piles up jobs
  //              issues anymore as now insert won't be blocked until the data is written to disk.
  //              However, this works at the cost of DATA LOSS if the ClickHouse server crashes
  //              before the data is written to disk.
  //              Because our Redis queue if without AOF + Fsync, may already suffer data loss issues,
  //              so it's not worsening the issue at least for now.
  //              Let's have this rolled out in production and see how things go for now,
  //              in the meantime, we should think about a better solution to handle this.
  wait_for_async_insert: 0,
  date_time_input_format: "best_effort"
};

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
    KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN: zodStrBool.default("false"),
    PORT: z.coerce.number().default(IS_PACKAGED ? 8080 : 4000),
    DISABLE_SECRET_SCANNING: z
      .enum(["true", "false"])
      .default("false")
      .transform((el) => el === "true"),
    REDIS_URL: zpStr(z.string().optional()),
    REDIS_USERNAME: zpStr(z.string().optional()),
    REDIS_PASSWORD: zpStr(z.string().optional()),
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
    REDIS_CLUSTER_HOSTS: zpStr(
      z
        .string()
        .optional()
        .describe("Comma-separated list of Redis Cluster host:port pairs. Eg: 192.168.65.254:6379,192.168.65.254:6380")
    ),
    REDIS_READ_REPLICAS: zpStr(
      z
        .string()
        .optional()
        .describe(
          "Comma-separated list of Redis read replicas host:port pairs. Eg: 192.168.65.254:6379,192.168.65.254:6380"
        )
    ),
    REDIS_CLUSTER_ENABLE_TLS: z
      .enum(["true", "false"])
      .default("false")
      .transform((el) => el === "true"),
    REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((el) => el === "true"),
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
    CLICKHOUSE_URL: zpStr(
      z
        .string()
        .optional()
        .describe("ClickHouse connection URL. Eg: http://localhost:8123 or https://user:password@host:8443/database")
    ),
    CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val || val.trim() === "") return DEFAULT_CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS;
          return JSON.parse(val) as Record<string, string | number | boolean>;
        })
        .default(JSON.stringify(DEFAULT_CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS))
        .describe(
          'ClickHouse insert settings as JSON. Eg: {"async_insert":1,"wait_for_async_insert":1}. Applied when inserting audit logs.'
        )
    ),
    CLICKHOUSE_AUDIT_LOG_ENGINE: zpStr(
      z
        .string()
        .optional()
        .default("ReplacingMergeTree")
        .describe(
          "ClickHouse engine for the audit_logs table. Used during migrations. Eg: ReplacingMergeTree or SharedReplacingMergeTree('/clickhouse/tables/{uuid}/{shard}', '{replica}')"
        )
    ),
    CLICKHOUSE_AUDIT_LOG_TABLE_NAME: zpStr(
      z.string().optional().default("audit_logs").describe("ClickHouse table name for audit logs")
    ),
    CLICKHOUSE_AUDIT_LOG_ENABLED: zodStrBool.default("true").describe("Enable inserting audit logs into ClickHouse"),
    CLICKHOUSE_AUDIT_LOG_QUERY_ENABLED: zodStrBool
      .default("false")
      .describe("Enable querying audit logs from ClickHouse instead of Postgres"),
    DISABLE_AUDIT_LOG_STORAGE: zodStrBool.default("false").optional().describe("Disable audit log storage"),
    GENERATE_SANITIZED_SCHEMA: zodStrBool
      .default("false")
      .describe("Generate sanitized schema with views after migrations"),
    SANITIZED_SCHEMA_ROLE: zpStr(
      z.string().describe("PostgreSQL role to grant read access to the sanitized schema").optional()
    ),
    MAX_LEASE_LIMIT: z.coerce.number().default(10000),
    DB_ROOT_CERT: zpStr(z.string().describe("Postgres database base64-encoded CA cert").optional()),
    DB_HOST: zpStr(z.string().describe("Postgres database host").optional()),
    DB_PORT: zpStr(z.string().describe("Postgres database port").optional()).default("5432"),
    DB_USER: zpStr(z.string().describe("Postgres database username").optional()),
    DB_PASSWORD: zpStr(z.string().describe("Postgres database password").optional()),
    DB_NAME: zpStr(z.string().describe("Postgres database name").optional()),
    DB_READ_REPLICAS: zpStr(z.string().describe("Postgres read replicas").optional()),
    BCRYPT_SALT_ROUND: z.number().optional(), // note(daniel): this is deprecated, use SALT_ROUNDS instead. only keeping this for backwards compatibility.
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
    DAILY_RESOURCE_CLEAN_UP_DEVELOPMENT_MODE: zodStrBool.default("false").optional(),
    BDD_NOCK_API_ENABLED: zodStrBool.default("false").optional(),
    ACME_DEVELOPMENT_MODE: zodStrBool.default("false").optional(),
    ACME_SKIP_UPSTREAM_VALIDATION: zodStrBool.default("false").optional(),
    ACME_DEVELOPMENT_HTTP01_CHALLENGE_HOST_OVERRIDES: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return {};
          return JSON.parse(val) as Record<string, string>;
        })
        .default("{}")
    ),
    ACME_DNS_RESOLVER_SERVERS: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return [];
          return val.split(",");
        })
    ),
    ACME_DNS_RESOLVE_RESOLVER_SERVERS_HOST_ENABLED: zodStrBool.default("false").optional(),
    DNS_MADE_EASY_SANDBOX_ENABLED: zodStrBool.default("false").optional(),
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
    // GitHub API token for upgrade path tool
    GITHUB_API_TOKEN: zpStr(z.string().optional()),
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
    CDN_HOST: zpStr(z.string().optional()),

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

    // Special Detection Feature
    PARAMS_FOLDER_SECRET_DETECTION_PATHS: zpStr(
      z
        .string()
        .optional()
        .transform((val) => {
          if (!val) return undefined;
          return JSON.parse(val) as { secretPath: string; projectId: string }[];
        })
    ),
    PARAMS_FOLDER_SECRET_DETECTION_ENTROPY: z.coerce.number().optional().default(3.7),

    INFISICAL_PRIMARY_INSTANCE_URL: zpStr(z.string().optional()),

    // HSM
    HSM_LIB_PATH: zpStr(z.string().optional()),
    HSM_PIN: zpStr(z.string().optional()),
    HSM_KEY_LABEL: zpStr(z.string().optional()),
    HSM_SLOT: z.coerce.number().optional().default(0),
    HSM_ENCRYPTION_STRATEGY: zpStr(z.enum(["AES", "RSA_PKCS"]).optional().default("AES")),

    USE_PG_QUEUE: zodStrBool.default("false"),
    SHOULD_INIT_PG_QUEUE: zodStrBool.default("false"),

    /* Gateway----------------------------------------------------------------------------- */
    GATEWAY_INFISICAL_STATIC_IP_ADDRESS: zpStr(z.string().optional()),
    GATEWAY_RELAY_ADDRESS: zpStr(z.string().optional()),
    GATEWAY_RELAY_REALM: zpStr(z.string().optional()),
    GATEWAY_RELAY_AUTH_SECRET: zpStr(z.string().optional()),

    RELAY_AUTH_SECRET: zpStr(z.string().optional()),

    DYNAMIC_SECRET_ALLOW_INTERNAL_IP: zodStrBool.default("false"),
    DYNAMIC_SECRET_AWS_ACCESS_KEY_ID: zpStr(z.string().optional()).default(
      process.env.INF_APP_CONNECTION_AWS_ACCESS_KEY_ID
    ),
    DYNAMIC_SECRET_AWS_SECRET_ACCESS_KEY: zpStr(z.string().optional()).default(
      process.env.INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY
    ),

    // PAM AWS credentials (for AWS IAM PAM resource type)
    PAM_AWS_ACCESS_KEY_ID: zpStr(z.string().optional()),
    PAM_AWS_SECRET_ACCESS_KEY: zpStr(z.string().optional()),
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

    // Legacy Single Multi Purpose Azure App Connection
    INF_APP_CONNECTION_AZURE_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_CLIENT_SECRET: zpStr(z.string().optional()),

    // Azure App Configuration App Connection
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET: zpStr(z.string().optional()),

    // Azure Key Vault App Connection
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET: zpStr(z.string().optional()),

    // Azure Client Secrets App Connection
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET: zpStr(z.string().optional()),

    // Azure DevOps App Connection
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET: zpStr(z.string().optional()),

    // Heroku App Connection
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: zpStr(z.string().optional()),
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET: zpStr(z.string().optional()),

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

    /* OracleDB ----------------------------------------------------------------------------- */
    TNS_ADMIN: zpStr(z.string().optional()),

    /* INTERNAL ----------------------------------------------------------------------------- */
    INTERNAL_REGION: zpStr(z.enum(["us", "eu"]).optional())
  })
  .refine(
    (data) => Boolean(data.REDIS_URL) || Boolean(data.REDIS_SENTINEL_HOSTS) || Boolean(data.REDIS_CLUSTER_HOSTS),
    "Either REDIS_URL, REDIS_SENTINEL_HOSTS or REDIS_CLUSTER_HOSTS  must be defined."
  )
  .transform((data) => ({
    ...data,
    SALT_ROUNDS: data.SALT_ROUNDS || data.BCRYPT_SALT_ROUND || 12,
    DB_READ_REPLICAS: data.DB_READ_REPLICAS
      ? databaseReadReplicaSchema.parse(JSON.parse(data.DB_READ_REPLICAS))
      : undefined,
    isCloud: Boolean(data.LICENSE_SERVER_KEY),
    isSmtpConfigured: Boolean(data.SMTP_HOST),
    isRedisConfigured: Boolean(data.REDIS_URL || data.REDIS_SENTINEL_HOSTS || data.REDIS_CLUSTER_HOSTS),
    isClickHouseConfigured: Boolean(data.CLICKHOUSE_URL),
    isDevelopmentMode: data.NODE_ENV === "development",
    isTestMode: data.NODE_ENV === "test",
    isRotationDevelopmentMode:
      (data.NODE_ENV === "development" && data.ROTATION_DEVELOPMENT_MODE) || data.NODE_ENV === "test",
    isDailyResourceCleanUpDevelopmentMode:
      data.NODE_ENV === "development" && data.DAILY_RESOURCE_CLEAN_UP_DEVELOPMENT_MODE,
    isAcmeDevelopmentMode: data.NODE_ENV === "development" && data.ACME_DEVELOPMENT_MODE,
    isProductionMode: data.NODE_ENV === "production" || IS_PACKAGED,
    isRedisSentinelMode: Boolean(data.REDIS_SENTINEL_HOSTS),
    isBddNockApiEnabled: data.NODE_ENV !== "production" && data.BDD_NOCK_API_ENABLED,
    REDIS_SENTINEL_HOSTS: data.REDIS_SENTINEL_HOSTS?.trim()
      ?.split(",")
      .map((el) => {
        const [host, port] = el.trim().split(":");
        return { host: host.trim(), port: Number(port.trim()) };
      }),
    REDIS_CLUSTER_HOSTS: data.REDIS_CLUSTER_HOSTS?.trim()
      ?.split(",")
      .map((el) => {
        const [host, port] = el.trim().split(":");
        return { host: host.trim(), port: Number(port.trim()) };
      }),
    REDIS_READ_REPLICAS: data.REDIS_READ_REPLICAS?.trim()
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
    isSecondaryInstance: Boolean(data.INFISICAL_PRIMARY_INSTANCE_URL),
    isHsmConfigured:
      Boolean(data.HSM_LIB_PATH) && Boolean(data.HSM_PIN) && Boolean(data.HSM_KEY_LABEL) && data.HSM_SLOT !== undefined,
    samlDefaultOrgSlug: data.DEFAULT_SAML_ORG_SLUG,
    SECRET_SCANNING_ORG_WHITELIST: data.SECRET_SCANNING_ORG_WHITELIST?.split(","),
    PARAMS_FOLDER_SECRET_DETECTION_ENABLED: (data.PARAMS_FOLDER_SECRET_DETECTION_PATHS?.length ?? 0) > 0,
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID:
      data.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET:
      data.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID:
      data.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET:
      data.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID:
      data.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET:
      data.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID:
      data.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID || data.INF_APP_CONNECTION_AZURE_CLIENT_ID,
    INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET:
      data.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET || data.INF_APP_CONNECTION_AZURE_CLIENT_SECRET,
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: data.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID || data.CLIENT_ID_HEROKU,
    INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET:
      data.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET || data.CLIENT_SECRET_HEROKU
  }));

export type TEnvConfig = Readonly<z.infer<typeof envSchema>>;
let envCfg: TEnvConfig;
let originalEnvConfig: TEnvConfig;

export const getConfig = () => envCfg;
export const getOriginalConfig = () => originalEnvConfig;

// cannot import singleton logger directly as it needs config to load various transport
export const initEnvConfig = async (
  hsmService: THsmServiceFactory,
  kmsRootConfigDAL: TKmsRootConfigDALFactory,
  superAdminDAL?: TSuperAdminDALFactory,
  logger?: CustomLogger
) => {
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

  if (superAdminDAL) {
    const fipsEnabled = await crypto.initialize(superAdminDAL, hsmService, kmsRootConfigDAL);

    if (fipsEnabled) {
      const newEnvCfg = {
        ...parsedEnv.data,
        ROOT_ENCRYPTION_KEY: envCfg.ENCRYPTION_KEY
      };

      delete newEnvCfg.ENCRYPTION_KEY;

      envCfg = Object.freeze(newEnvCfg);
    }
  }

  return envCfg;
};

export const getTelemetryConfig = () => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment variables. Check the error below");
    // eslint-disable-next-line no-console
    console.error(parsedEnv.error.issues);
    process.exit(-1);
  }

  return {
    useOtel: parsedEnv.data.OTEL_TELEMETRY_COLLECTION_ENABLED,
    useDataDogTracer: parsedEnv.data.SHOULD_USE_DATADOG_TRACER,
    OTEL: {
      otlpURL: parsedEnv.data.OTEL_EXPORT_OTLP_ENDPOINT,
      otlpUser: parsedEnv.data.OTEL_COLLECTOR_BASIC_AUTH_USERNAME,
      otlpPassword: parsedEnv.data.OTEL_COLLECTOR_BASIC_AUTH_PASSWORD,
      otlpPushInterval: parsedEnv.data.OTEL_OTLP_PUSH_INTERVAL,
      exportType: parsedEnv.data.OTEL_EXPORT_TYPE
    },
    TRACER: {
      profiling: parsedEnv.data.DATADOG_PROFILING_ENABLED,
      version: parsedEnv.data.INFISICAL_PLATFORM_VERSION,
      env: parsedEnv.data.DATADOG_ENV,
      service: parsedEnv.data.DATADOG_SERVICE,
      hostname: parsedEnv.data.DATADOG_HOSTNAME
    }
  };
};

export const getDatabaseCredentials = (logger?: CustomLogger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    (logger ?? console).error("Invalid environment variables. Check the error below");
    (logger ?? console).error(parsedEnv.error.issues);
    process.exit(-1);
  }

  return {
    dbConnectionUri: parsedEnv.data.DB_CONNECTION_URI,
    dbRootCert: parsedEnv.data.DB_ROOT_CERT,
    readReplicas: parsedEnv.data.DB_READ_REPLICAS?.map((el) => ({
      dbRootCert: el.DB_ROOT_CERT,
      dbConnectionUri: el.DB_CONNECTION_URI
    }))
  };
};

export const getHsmConfig = (logger?: CustomLogger) => {
  const parsedEnv = envSchema.safeParse(process.env);
  if (!parsedEnv.success) {
    (logger ?? console).error("Invalid environment variables. Check the error below");
    (logger ?? console).error(parsedEnv.error.issues);
    process.exit(-1);
  }
  return {
    isHsmConfigured: parsedEnv.data.isHsmConfigured,
    HSM_PIN: parsedEnv.data.HSM_PIN,
    HSM_SLOT: parsedEnv.data.HSM_SLOT,
    HSM_LIB_PATH: parsedEnv.data.HSM_LIB_PATH,
    HSM_KEY_LABEL: parsedEnv.data.HSM_KEY_LABEL,
    HSM_ENCRYPTION_STRATEGY: parsedEnv.data.HSM_ENCRYPTION_STRATEGY
  };
};

// A list of environment variables that can be overwritten
export const overwriteSchema: {
  [key: string]: {
    name: string;
    fields: { key: keyof TEnvConfig; description?: string }[];
  };
} = {
  auditLogs: {
    name: "Audit Logs",
    fields: [
      {
        key: "DISABLE_AUDIT_LOG_STORAGE",
        description: "Disable audit log storage"
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
        description: "The GCP Service Account JSON credentials."
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
    envCfg = Object.freeze({
      ...parsedResult.data,
      ENCRYPTION_KEY: envCfg.ENCRYPTION_KEY,
      ROOT_ENCRYPTION_KEY: envCfg.ROOT_ENCRYPTION_KEY
    });
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
