import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { overridableKeys, resolveOverridableEnv } from "./env";

beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", "test-auth-secret");
  vi.stubEnv("REDIS_URL", "redis://localhost:6379");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const resolveOrFail = (overrides: Record<string, string>) => {
  const result = resolveOverridableEnv(overrides);
  if (!result.success) throw new Error(result.issues.join("\n"));
  return result.config;
};

describe("resolveOverridableEnv", () => {
  test("should resolve the overridable keys from the process env", () => {
    // Setup
    vi.stubEnv("CLIENT_ID_GOOGLE_LOGIN", "from-env");

    // Action
    const config = resolveOrFail({});

    // Assert
    expect(config.CLIENT_ID_GOOGLE_LOGIN).toBe("from-env");
    expect(config.DISABLE_PUBLIC_SECRET_SHARING).toBe(false);
  });

  test("should return only the overridable keys and the derived flag", () => {
    // Setup
    // Action
    const config = resolveOrFail({});

    // Assert
    expect(Object.keys(config).every((key) => overridableKeys.has(key) || key === "isGithubRadarConfigured")).toBe(
      true
    );
  });

  test("should let an override win over the process env", () => {
    // Setup
    vi.stubEnv("CLIENT_ID_GOOGLE_LOGIN", "from-env");

    // Action
    const config = resolveOrFail({ CLIENT_ID_GOOGLE_LOGIN: "from-admin" });

    // Assert
    expect(config.CLIENT_ID_GOOGLE_LOGIN).toBe("from-admin");
  });

  test("should resolve DISABLE_POSTGRES_AUDIT_LOG_STORAGE set to false as false", () => {
    // Setup
    // Action
    const config = resolveOrFail({ DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "false" });

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(false);
  });

  test("should resolve DISABLE_POSTGRES_AUDIT_LOG_STORAGE set to true as true", () => {
    // Setup
    // Action
    const config = resolveOrFail({ DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "true" });

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(true);
  });

  test("should honour the legacy DISABLE_AUDIT_LOG_STORAGE alias when the new key is not set", () => {
    // Setup
    // Action
    const config = resolveOrFail({ DISABLE_AUDIT_LOG_STORAGE: "true" });

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(true);
  });

  test("should prefer DISABLE_POSTGRES_AUDIT_LOG_STORAGE over the legacy alias", () => {
    // Setup
    // Action
    const config = resolveOrFail({
      DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "false",
      DISABLE_AUDIT_LOG_STORAGE: "true"
    });

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(false);
  });

  test("should ignore a key an admin cannot override", () => {
    // Setup
    vi.stubEnv("SALT_ROUNDS", "11");

    // Action
    const result = resolveOverridableEnv({ SALT_ROUNDS: "not a number" });

    // Assert
    expect(result.success).toBe(true);
  });

  test("should report one line naming the key when the env does not parse", () => {
    // Setup
    vi.stubEnv("AUTH_SECRET", undefined);

    // Action
    const result = resolveOverridableEnv({});

    // Assert
    expect(result).toEqual({ success: false, issues: ['Key: "AUTH_SECRET", Error: Required'] });
  });

  test("should fall back to INF_APP_CONNECTION_AZURE_CLIENT_ID for a per-service Azure client id", () => {
    // Setup
    vi.stubEnv("INF_APP_CONNECTION_AZURE_CLIENT_ID", "legacy-azure-id");

    // Action
    const config = resolveOrFail({ INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: "key-vault-id" });

    // Assert
    expect(config.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID).toBe("key-vault-id");
    expect(config.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID).toBe("legacy-azure-id");
    expect(config.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID).toBe("legacy-azure-id");
  });

  test("should report GitHub radar as configured only when all six radar overrides are set", () => {
    // Setup
    const radar = {
      INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: "1",
      INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: "key",
      INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: "slug",
      INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: "client",
      INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: "secret",
      INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: "webhook"
    };
    const { INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: _omitted, ...fiveOfSix } = radar;

    // Action
    const all = resolveOrFail(radar);
    const some = resolveOrFail(fiveOfSix);

    // Assert
    expect(all.isGithubRadarConfigured).toBe(true);
    expect(some.isGithubRadarConfigured).toBe(false);
  });
});
