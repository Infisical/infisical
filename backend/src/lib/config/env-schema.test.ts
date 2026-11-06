import { describe, expect, test } from "vitest";

import { envSchema } from "./env";

const BASE = {
  DB_CONNECTION_URI: "postgres://infisical:infisical@localhost:5432/infisical",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "env-schema-test-secret",
  ENCRYPTION_KEY: "0".repeat(32)
};

describe("envSchema", () => {
  test("fills the documented defaults when a variable is unset", () => {
    const env = envSchema.parse(BASE);

    expect(env).toMatchObject({
      PORT: 4000,
      HOST: "localhost",
      DB_PORT: "5432",
      SMTP_REQUIRE_TLS: true,
      TELEMETRY_ENABLED: true,
      ROTATION_DEVELOPMENT_MODE: false,
      OPENAPI_FULL_SPEC: false,
      ACME_DEVELOPMENT_MODE: false
    });
  });

  test("parses typical values the way it always has", () => {
    expect(envSchema.parse({ ...BASE, SITE_URL: " https://a.example.com/ " }).SITE_URL).toBe("https://a.example.com");
    expect(envSchema.parse({ ...BASE, INFISICAL_RUN_MODES: "api, general-workers" }).INFISICAL_RUN_MODES).toEqual([
      "api",
      "general-workers"
    ]);
    expect(envSchema.parse({ ...BASE, ROTATION_DEVELOPMENT_MODE: "true" }).ROTATION_DEVELOPMENT_MODE).toBe(true);
  });

  // Deployments commonly template every variable and leave unused ones empty. These are the variables that
  // reject an empty value, the same set the Zod 3 schema rejected; a new one should be a deliberate choice.
  test("rejects an empty string only for the variables that always did", () => {
    const keys = Object.keys(envSchema.in.shape).filter((key) => !(key in BASE));
    const failures = keys.filter((key) => !envSchema.safeParse({ ...BASE, [key]: "" }).success);

    expect(failures.sort()).toEqual(
      [
        "AUDIT_LOGS_DB_POOL_MAX",
        "BCRYPT_SALT_ROUND",
        "DB_POOL_MAX",
        "DB_REPLICA_POOL_MAX",
        "DISABLE_SECRET_SCANNING",
        "KMS_ROOT_KEY_RETENTION_DAYS",
        "NODE_ENV",
        "OTEL_EXPORT_TYPE",
        "REDIS_CLUSTER_AWS_ELASTICACHE_DNS_LOOKUP_MODE",
        "REDIS_CLUSTER_ENABLE_TLS",
        "SITE_URL",
        "STANDALONE_MODE"
      ].sort()
    );
  });
});
