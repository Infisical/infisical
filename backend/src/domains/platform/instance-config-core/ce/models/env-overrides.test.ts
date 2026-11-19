import { EnvOverrides } from "./env-overrides";

const RADAR_ENV = {
  INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: "1",
  INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY: "key",
  INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG: "slug",
  INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID: "client",
  INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET: "secret",
  INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: "webhook"
};

describe("EnvOverrides.create", () => {
  test("should drop the keys an admin cannot override", () => {
    // Setup
    const raw = { CLIENT_ID_GOOGLE_LOGIN: "1", SALT_ROUNDS: "2" };

    // Action
    const overrides = EnvOverrides.create(raw);

    // Assert
    expect(overrides.toJSON()).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "1" });
  });

  test("should drop the env values that only back a fallback", () => {
    // Setup
    const raw = { INF_APP_CONNECTION_AZURE_CLIENT_ID: "azure", CLIENT_ID_HEROKU: "heroku", URL_GITLAB_LOGIN: "url" };

    // Action
    const overrides = EnvOverrides.create(raw);

    // Assert
    expect(overrides.toJSON()).toEqual({});
  });
});

describe("EnvOverrides.toBytes", () => {
  test("should round trip through fromBytes", () => {
    // Setup
    const overrides = EnvOverrides.restore({ CLIENT_ID_GOOGLE_LOGIN: "1", CLIENT_ID_GITHUB_LOGIN: "2" });

    // Action
    const restored = EnvOverrides.fromBytes(overrides.toBytes());

    // Assert
    expect(restored.toJSON()).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "1", CLIENT_ID_GITHUB_LOGIN: "2" });
  });

  test("should be the JSON object every release has written", () => {
    // Setup
    const overrides = EnvOverrides.restore({ CLIENT_ID_GOOGLE_LOGIN: "1" });

    // Action
    const bytes = overrides.toBytes();

    // Assert
    expect(bytes.toString()).toBe('{"CLIENT_ID_GOOGLE_LOGIN":"1"}');
  });
});

describe("EnvOverrides.organize", () => {
  test("should list every overridable key exactly once across the groups", () => {
    // Setup
    const overrides = EnvOverrides.none();

    // Action
    const organized = overrides.organize({});

    // Assert
    const keys = Object.values(organized).flatMap((group) => group.fields.map((field) => field.key));
    expect(keys).toHaveLength(EnvOverrides.KEYS.length);
    expect([...keys].sort()).toEqual([...EnvOverrides.KEYS].sort());
  });

  test("should list the fields of a group with its name", () => {
    // Setup
    const overrides = EnvOverrides.none();

    // Action
    const organized = overrides.organize({});

    // Assert
    expect(organized.google_sso).toMatchObject({
      name: "Google SSO",
      fields: [
        { key: "CLIENT_ID_GOOGLE_LOGIN", value: "", hasEnvEntry: false },
        { key: "CLIENT_SECRET_GOOGLE_LOGIN", value: "", hasEnvEntry: false }
      ]
    });
  });

  test("should show the override and whether the env alone sets the key", () => {
    // Setup
    const overrides = EnvOverrides.restore({ CLIENT_ID_GOOGLE_LOGIN: "from-admin" });

    // Action
    const organized = overrides.organize({ CLIENT_SECRET_GOOGLE_LOGIN: "from-env" });

    // Assert
    expect(organized.google_sso.fields).toMatchObject([
      { key: "CLIENT_ID_GOOGLE_LOGIN", value: "from-admin", hasEnvEntry: false },
      { key: "CLIENT_SECRET_GOOGLE_LOGIN", value: "", hasEnvEntry: true }
    ]);
  });

  test("should not count an env value that resolves to false as set", () => {
    // Setup
    const overrides = EnvOverrides.none();

    // Action
    const organized = overrides.organize({ DISABLE_PUBLIC_SECRET_SHARING: "false" });

    // Assert
    expect(organized.secretSharing.fields[0]).toMatchObject({
      key: "DISABLE_PUBLIC_SECRET_SHARING",
      hasEnvEntry: false
    });
  });
});

describe("EnvOverrides.none", () => {
  test("should hold no overrides", () => {
    // Setup
    // Action
    const overrides = EnvOverrides.none();

    // Assert
    expect(overrides.toJSON()).toEqual({});
  });
});

describe("EnvOverrides.resolve", () => {
  test("should resolve the overridable keys from the env", () => {
    // Setup
    const env = { CLIENT_ID_GOOGLE_LOGIN: "from-env" };

    // Action
    const config = EnvOverrides.none().resolve(env);

    // Assert
    expect(config.CLIENT_ID_GOOGLE_LOGIN).toBe("from-env");
    expect(config.DISABLE_PUBLIC_SECRET_SHARING).toBe(false);
  });

  test("should return only the overridable keys and the derived flag", () => {
    // Setup
    // Action
    const config = EnvOverrides.none().resolve({ SALT_ROUNDS: "11" });

    // Assert
    expect(
      Object.keys(config).every((key) => EnvOverrides.KEYS.includes(key) || key === "isGithubRadarConfigured")
    ).toBe(true);
  });

  test("should let an override win over the env", () => {
    // Setup
    const overrides = EnvOverrides.create({ CLIENT_ID_GOOGLE_LOGIN: "from-admin" });

    // Action
    const config = overrides.resolve({ CLIENT_ID_GOOGLE_LOGIN: "from-env" });

    // Assert
    expect(config.CLIENT_ID_GOOGLE_LOGIN).toBe("from-admin");
  });

  test("should ignore a key an admin cannot override", () => {
    // Setup
    const overrides = EnvOverrides.create({ SALT_ROUNDS: "not a number" });

    // Action
    const config = overrides.resolve({ SALT_ROUNDS: "11" });

    // Assert
    expect(config).not.toHaveProperty("SALT_ROUNDS");
  });

  test("should resolve DISABLE_POSTGRES_AUDIT_LOG_STORAGE set to false as false", () => {
    // Setup
    const overrides = EnvOverrides.create({ DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "false" });

    // Action
    const config = overrides.resolve({});

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(false);
  });

  test("should resolve DISABLE_POSTGRES_AUDIT_LOG_STORAGE set to true as true", () => {
    // Setup
    const overrides = EnvOverrides.create({ DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "true" });

    // Action
    const config = overrides.resolve({});

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(true);
  });

  test("should honour the legacy DISABLE_AUDIT_LOG_STORAGE alias when the new key is not set", () => {
    // Setup
    const overrides = EnvOverrides.create({ DISABLE_AUDIT_LOG_STORAGE: "true" });

    // Action
    const config = overrides.resolve({});

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(true);
  });

  test("should prefer DISABLE_POSTGRES_AUDIT_LOG_STORAGE over the legacy alias", () => {
    // Setup
    const overrides = EnvOverrides.create({
      DISABLE_POSTGRES_AUDIT_LOG_STORAGE: "false",
      DISABLE_AUDIT_LOG_STORAGE: "true"
    });

    // Action
    const config = overrides.resolve({});

    // Assert
    expect(config.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(false);
  });

  test("should fall back to INF_APP_CONNECTION_AZURE_CLIENT_ID for a per-service Azure client id", () => {
    // Setup
    const overrides = EnvOverrides.create({ INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: "key-vault-id" });
    const env = { INF_APP_CONNECTION_AZURE_CLIENT_ID: "legacy-azure-id" };

    // Action
    const config = overrides.resolve(env);

    // Assert
    expect(config.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID).toBe("key-vault-id");
    expect(config.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID).toBe("legacy-azure-id");
    expect(config.INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID).toBe("legacy-azure-id");
    expect(config.INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID).toBe("legacy-azure-id");
  });

  test("should fall back to INF_APP_CONNECTION_AZURE_CLIENT_SECRET for a per-service Azure client secret", () => {
    // Setup
    const env = { INF_APP_CONNECTION_AZURE_CLIENT_SECRET: "legacy-azure-secret" };

    // Action
    const config = EnvOverrides.none().resolve(env);

    // Assert
    expect(config.INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET).toBe("legacy-azure-secret");
    expect(config.INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET).toBe("legacy-azure-secret");
  });

  test("should fall back to the legacy Heroku client values", () => {
    // Setup
    const env = { CLIENT_ID_HEROKU: "legacy-id", CLIENT_SECRET_HEROKU: "legacy-secret" };

    // Action
    const config = EnvOverrides.none().resolve(env);

    // Assert
    expect(config.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID).toBe("legacy-id");
    expect(config.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET).toBe("legacy-secret");
  });

  test("should prefer the Heroku OAuth override over the legacy value", () => {
    // Setup
    const overrides = EnvOverrides.create({ INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: "from-admin" });

    // Action
    const config = overrides.resolve({ CLIENT_ID_HEROKU: "legacy-id" });

    // Assert
    expect(config.INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID).toBe("from-admin");
  });

  test("should default the GitLab login URL to gitlab.com", () => {
    // Setup
    // Action
    const config = EnvOverrides.none().resolve({});

    // Assert
    expect(config.CLIENT_GITLAB_LOGIN_URL).toBe("https://gitlab.com");
  });

  test("should take the GitLab login URL from URL_GITLAB_LOGIN", () => {
    // Setup
    const env = { URL_GITLAB_LOGIN: "https://gitlab.example.com" };

    // Action
    const config = EnvOverrides.none().resolve(env);

    // Assert
    expect(config.CLIENT_GITLAB_LOGIN_URL).toBe("https://gitlab.example.com");
  });

  test("should prefer CLIENT_GITLAB_LOGIN_URL over URL_GITLAB_LOGIN", () => {
    // Setup
    const overrides = EnvOverrides.create({ CLIENT_GITLAB_LOGIN_URL: "https://from-admin.example.com" });

    // Action
    const config = overrides.resolve({ URL_GITLAB_LOGIN: "https://gitlab.example.com" });

    // Assert
    expect(config.CLIENT_GITLAB_LOGIN_URL).toBe("https://from-admin.example.com");
  });

  test("should report GitHub radar as configured only when all six radar values are set", () => {
    // Setup
    const { INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: _omitted, ...fiveOfSix } = RADAR_ENV;

    // Action
    const all = EnvOverrides.create(RADAR_ENV).resolve({});
    const some = EnvOverrides.create(fiveOfSix).resolve({});

    // Assert
    expect(all.isGithubRadarConfigured).toBe(true);
    expect(some.isGithubRadarConfigured).toBe(false);
  });

  test("should count radar values from the env towards the flag", () => {
    // Setup
    // Action
    const config = EnvOverrides.none().resolve(RADAR_ENV);

    // Assert
    expect(config.isGithubRadarConfigured).toBe(true);
  });
});
