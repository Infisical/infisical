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

describe("EnvOverrides.fromBytes", () => {
  test("should drop stored keys an admin cannot override, so they never replace the env's fallbacks", () => {
    // Setup
    const stored = Buffer.from(
      JSON.stringify({
        CLIENT_ID_GOOGLE_LOGIN: "1",
        INF_APP_CONNECTION_AZURE_CLIENT_ID: "stored-azure",
        CLIENT_SECRET_HEROKU: "stored-heroku",
        URL_GITLAB_LOGIN: "https://stored.example.com",
        SALT_ROUNDS: "2"
      })
    );

    // Action
    const overrides = EnvOverrides.fromBytes(stored);

    // Assert
    expect(overrides.toJSON()).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "1" });
    expect(
      overrides.resolve({
        INF_APP_CONNECTION_AZURE_CLIENT_ID: "env-azure",
        URL_GITLAB_LOGIN: "https://env.example.com"
      })
    ).toMatchObject({
      INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID: "env-azure",
      CLIENT_GITLAB_LOGIN_URL: "https://env.example.com"
    });
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

// The keys the previous release's overwriteSchema (lib/config/env.ts) let an admin override.
const PREVIOUS_RELEASE_KEYS = [
  "DISABLE_POSTGRES_AUDIT_LOG_STORAGE",
  "DISABLE_AUDIT_LOG_STORAGE",
  "INF_APP_CONNECTION_AWS_ACCESS_KEY_ID",
  "INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY",
  "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID",
  "INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET",
  "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID",
  "INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET",
  "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID",
  "INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET",
  "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID",
  "INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET",
  "INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL",
  "INF_APP_CONNECTION_GITHUB_APP_CLIENT_ID",
  "INF_APP_CONNECTION_GITHUB_APP_CLIENT_SECRET",
  "INF_APP_CONNECTION_GITHUB_APP_SLUG",
  "INF_APP_CONNECTION_GITHUB_APP_ID",
  "INF_APP_CONNECTION_GITHUB_APP_PRIVATE_KEY",
  "INF_APP_CONNECTION_GITHUB_APP_HOST",
  "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_ID",
  "INF_APP_CONNECTION_GITHUB_OAUTH_CLIENT_SECRET",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_ID",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_CLIENT_SECRET",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_SLUG",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_ID",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_PRIVATE_KEY",
  "INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET",
  "CLIENT_ID_GITHUB_LOGIN",
  "CLIENT_SECRET_GITHUB_LOGIN",
  "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_ID",
  "INF_APP_CONNECTION_GITLAB_OAUTH_CLIENT_SECRET",
  "CLIENT_ID_GITLAB_LOGIN",
  "CLIENT_SECRET_GITLAB_LOGIN",
  "CLIENT_GITLAB_LOGIN_URL",
  "CLIENT_ID_GOOGLE_LOGIN",
  "CLIENT_SECRET_GOOGLE_LOGIN",
  "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID",
  "INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET",
  "INF_APP_CONNECTION_STRIPE_OAUTH_CLIENT_ID",
  "INF_APP_CONNECTION_STRIPE_OAUTH_AUTHORIZE_URL",
  "INF_APP_CONNECTION_STRIPE_SECRET_KEY",
  "DISABLE_PUBLIC_SECRET_SHARING"
];

const AZURE_KEYS: Record<string, string> = {
  INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_ID: "INF_APP_CONNECTION_AZURE_CLIENT_ID",
  INF_APP_CONNECTION_AZURE_APP_CONFIGURATION_CLIENT_SECRET: "INF_APP_CONNECTION_AZURE_CLIENT_SECRET",
  INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_ID: "INF_APP_CONNECTION_AZURE_CLIENT_ID",
  INF_APP_CONNECTION_AZURE_KEY_VAULT_CLIENT_SECRET: "INF_APP_CONNECTION_AZURE_CLIENT_SECRET",
  INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_ID: "INF_APP_CONNECTION_AZURE_CLIENT_ID",
  INF_APP_CONNECTION_AZURE_CLIENT_SECRETS_CLIENT_SECRET: "INF_APP_CONNECTION_AZURE_CLIENT_SECRET",
  INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_ID: "INF_APP_CONNECTION_AZURE_CLIENT_ID",
  INF_APP_CONNECTION_AZURE_DEVOPS_CLIENT_SECRET: "INF_APP_CONNECTION_AZURE_CLIENT_SECRET",
  INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_ID: "CLIENT_ID_HEROKU",
  INF_APP_CONNECTION_HEROKU_OAUTH_CLIENT_SECRET: "CLIENT_SECRET_HEROKU"
};

const BOOLEAN_KEYS = [
  "DISABLE_POSTGRES_AUDIT_LOG_STORAGE",
  "DISABLE_AUDIT_LOG_STORAGE",
  "DISABLE_PUBLIC_SECRET_SHARING"
];

const PLAIN_STRING_KEYS = PREVIOUS_RELEASE_KEYS.filter(
  (key) => !BOOLEAN_KEYS.includes(key) && !(key in AZURE_KEYS) && key !== "CLIENT_GITLAB_LOGIN_URL"
);

const INPUTS: (string | undefined)[] = [undefined, "", "  padded  ", "true", "false", "TRUE", "1", " true "];

// The previous release parsed every plain key with zpStr(z.string().optional()): trimmed, "" read as unset.
const previousPlainString = (value: string | undefined) => value?.trim() || undefined;
// zodStrBool: z.string().optional().transform((val) => val === "true"), no trimming.
const previousStrBool = (value: string | undefined) => value === "true";

const asEnv = (entries: Record<string, string | undefined>) => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) env[key] = value;
  return env;
};

// Each case resolves the value once from the process env and once as a stored override over an empty env, as the
// previous release's overrideEnvConfig merged overrides onto process.env before parsing.
const resolveBoth = (key: string, value: string | undefined, processEnv: Record<string, string> = {}) => {
  const fromEnv: Record<string, unknown> = EnvOverrides.none().resolve({ ...processEnv, ...asEnv({ [key]: value }) });
  const fromOverride: Record<string, unknown> =
    value === undefined ? fromEnv : EnvOverrides.restore({ [key]: value }).resolve(processEnv);
  return [fromEnv, fromOverride];
};

describe("EnvOverrides.KEYS", () => {
  test("should be exactly the keys the previous release let an admin override", () => {
    // Setup
    const expected = [...PREVIOUS_RELEASE_KEYS].sort();

    // Action
    const keys = [...EnvOverrides.KEYS].sort();

    // Assert
    expect(keys).toHaveLength(42);
    expect(keys).toEqual(expected);
  });
});

describe("EnvOverrides.resolve", () => {
  const plainCases = PLAIN_STRING_KEYS.flatMap((key) => INPUTS.map((value) => [key, value] as const));

  test.each(plainCases)("should resolve the plain key %s from %j as the previous release did", (key, value) => {
    // Setup
    const expected = previousPlainString(value);

    // Action
    const results = resolveBoth(key, value);

    // Assert
    for (const result of results) expect(result[key]).toBe(expected);
  });

  const fallbackCases = Object.keys(AZURE_KEYS).flatMap((key) =>
    INPUTS.flatMap((value) => [undefined, "", "  shared  "].map((fallback) => [key, value, fallback] as const))
  );

  test.each(fallbackCases)(
    "should resolve %s from %j over the shared value %j as the previous release did",
    (key, value, fallback) => {
      // Setup
      const processEnv = asEnv({ [AZURE_KEYS[key]]: fallback });
      const expected = previousPlainString(value) || previousPlainString(fallback);

      // Action
      const results = resolveBoth(key, value, processEnv);

      // Assert
      for (const result of results) expect(result[key]).toBe(expected);
    }
  );

  test.each(INPUTS)("should resolve DISABLE_PUBLIC_SECRET_SHARING from %j as the previous release did", (value) => {
    // Setup
    const expected = previousStrBool(value);

    // Action
    const results = resolveBoth("DISABLE_PUBLIC_SECRET_SHARING", value);

    // Assert
    for (const result of results) expect(result.DISABLE_PUBLIC_SECRET_SHARING).toBe(expected);
  });

  test.each(INPUTS)("should resolve DISABLE_AUDIT_LOG_STORAGE from %j as the previous release did", (value) => {
    // Setup
    const expected = value === undefined ? undefined : previousStrBool(value);

    // Action
    const results = resolveBoth("DISABLE_AUDIT_LOG_STORAGE", value);

    // Assert
    for (const result of results) {
      expect(result.DISABLE_AUDIT_LOG_STORAGE).toBe(expected);
      expect(result.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(expected ?? false);
    }
  });

  const auditCases = INPUTS.flatMap((value) => INPUTS.map((legacy) => [value, legacy] as const));

  test.each(auditCases)(
    "should resolve DISABLE_POSTGRES_AUDIT_LOG_STORAGE %j with the legacy alias %j as the previous release did",
    (value, legacy) => {
      // Setup
      const processEnv = asEnv({ DISABLE_AUDIT_LOG_STORAGE: legacy });
      const own = value === undefined ? undefined : previousStrBool(value);
      const alias = legacy === undefined ? undefined : previousStrBool(legacy);

      // Action
      const results = resolveBoth("DISABLE_POSTGRES_AUDIT_LOG_STORAGE", value, processEnv);

      // Assert
      for (const result of results) expect(result.DISABLE_POSTGRES_AUDIT_LOG_STORAGE).toBe(own ?? alias ?? false);
    }
  );

  // The previous default was process.env.URL_GITLAB_LOGIN ?? GITLAB_URL, taken raw (untrimmed), used when the trimmed
  // CLIENT_GITLAB_LOGIN_URL was empty.
  const gitlabCases = INPUTS.flatMap((value) =>
    [undefined, "", "  https://legacy.example.com  "].map((legacy) => [value, legacy] as const)
  );

  test.each(gitlabCases)(
    "should resolve CLIENT_GITLAB_LOGIN_URL %j with URL_GITLAB_LOGIN %j as the previous release did",
    (value, legacy) => {
      // Setup
      const processEnv = asEnv({ URL_GITLAB_LOGIN: legacy });
      const expected = previousPlainString(value) ?? legacy ?? "https://gitlab.com";

      // Action
      const results = resolveBoth("CLIENT_GITLAB_LOGIN_URL", value, processEnv);

      // Assert
      for (const result of results) expect(result.CLIENT_GITLAB_LOGIN_URL).toBe(expected);
    }
  );

  test.each(INPUTS)("should accept the override %j for every key, as the previous validation did", (value) => {
    // Setup
    const raw = Object.fromEntries(PREVIOUS_RELEASE_KEYS.map((key) => [key, value ?? "x"]));

    // Action
    const overrides = EnvOverrides.create(raw);

    // Assert
    expect(Object.keys(overrides.toJSON()).sort()).toEqual([...PREVIOUS_RELEASE_KEYS].sort());
  });

  test("should let an empty override hide the process env value, as the previous merge did", () => {
    // Setup
    const processEnv = { CLIENT_ID_GITHUB_LOGIN: "from-env", DISABLE_PUBLIC_SECRET_SHARING: "true" };

    // Action
    const resolved = EnvOverrides.restore({ CLIENT_ID_GITHUB_LOGIN: "", DISABLE_PUBLIC_SECRET_SHARING: "" }).resolve(
      processEnv
    );

    // Assert
    expect(resolved.CLIENT_ID_GITHUB_LOGIN).toBeUndefined();
    expect(resolved.DISABLE_PUBLIC_SECRET_SHARING).toBe(false);
  });

  test("should show an empty override that hides the process env value as no override", () => {
    // Setup
    const processEnv = { DISABLE_PUBLIC_SECRET_SHARING: "true" };
    const overrides = EnvOverrides.restore({ DISABLE_PUBLIC_SECRET_SHARING: "" });

    // Action
    const field = overrides
      .organize(processEnv)
      .secretSharing.fields.find(({ key }) => key === "DISABLE_PUBLIC_SECRET_SHARING");

    // Assert
    expect(overrides.resolve(processEnv).DISABLE_PUBLIC_SECRET_SHARING).toBe(false);
    expect(field).toMatchObject({ value: "", hasEnvEntry: true });
  });

  test.each([
    [RADAR_ENV, true],
    [{ ...RADAR_ENV, INF_APP_CONNECTION_GITHUB_RADAR_APP_ID: "  " }, false],
    [{ ...RADAR_ENV, INF_APP_CONNECTION_GITHUB_RADAR_APP_WEBHOOK_SECRET: "" }, false]
  ])("should derive isGithubRadarConfigured from %j as the previous release did", (processEnv, expected) => {
    // Setup
    const overrides = EnvOverrides.none();

    // Action
    const resolved = overrides.resolve(processEnv);

    // Assert
    expect(resolved.isGithubRadarConfigured).toBe(expected);
  });
});
