import { ReadFrom } from "@app/domains/lib/data-access-db";
import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";

import { SERVER_CONFIG_CACHE_KEY } from "../data-access/server-config-cache";
import { buildInMemoryInstanceConfigCore } from "../testing/build-instance-config-core";
import { FakeInstanceConfigEnv } from "../testing/fake-instance-config-env";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const initialized = async (opts: Parameters<typeof buildInMemoryInstanceConfigCore>[0] = {}) => {
  const built = buildInMemoryInstanceConfigCore(opts);
  await built.module.initialize();
  return built;
};

describe("InstanceConfigService.initialize", () => {
  test("should create the row with fipsEnabled from the FIPS mode", async () => {
    // Setup
    const built = buildInMemoryInstanceConfigCore({ fipsEnabled: true });

    // Action
    await built.module.initialize();

    // Assert
    const config = await built.config.getServerConfig();
    expect(config.fipsEnabled).toBe(true);
    expect(config.initialized).toBe(false);
    expect(config.allowSignUp).toBe(true);
  });

  test("should leave an existing row unchanged", async () => {
    // Setup
    const first = await initialized();
    await first.config.updateConfig({ allowSignUp: false });
    const secondPod = buildInMemoryInstanceConfigCore({ inMemory: first.inMemory, fipsEnabled: true });

    // Action
    await secondPod.module.initialize();

    // Assert
    const config = await secondPod.config.getServerConfig();
    expect(config.allowSignUp).toBe(false);
    expect(config.fipsEnabled).toBe(false);
  });
});

describe("InstanceConfigService.getServerConfig", () => {
  test("should read the database on a miss and the cache on a hit", async () => {
    // Setup
    const built = await initialized();
    await built.config.getServerConfig();
    const readsAfterMiss = built.state.reads;

    // Action
    await built.config.getServerConfig();

    // Assert
    expect(built.state.reads).toBe(readsAfterMiss);
  });

  test("should return the view of a row a previous release cached", async () => {
    // Setup
    const built = await initialized();
    const row = { ...built.state.tables.row, allowSignUp: false, encryptedSlackClientId: Buffer.from("x") };
    await built.keyStore.setItemWithExpiry(SERVER_CONFIG_CACHE_KEY, 60, JSON.stringify(row));

    // Action
    const config = await built.config.getServerConfig();

    // Assert
    expect(config.allowSignUp).toBe(false);
    expect(config).not.toHaveProperty("encryptedSlackClientId");
  });
});

describe("InstanceConfigService.updateConfig", () => {
  test("should rewrite the shared cache so another pod sees the change on its next read", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    const podA = await initialized({ keyStore });
    const podB = buildInMemoryInstanceConfigCore({ inMemory: podA.inMemory, keyStore, kms: podA.kms });
    await podB.config.getServerConfig();

    // Action
    await podA.config.updateConfig({ allowSignUp: false });

    // Assert
    expect((await podB.config.getServerConfig()).allowSignUp).toBe(false);
  });

  test("should keep the encrypted columns in the cached row for pods of the previous release", async () => {
    // Setup
    const built = await initialized();

    // Action
    await built.config.updateConfig({ slackClientId: "slack-id" });

    // Assert
    const cached = JSON.parse((await built.keyStore.getItem(SERVER_CONFIG_CACHE_KEY)) as string) as {
      encryptedSlackClientId: { data: number[] };
    };
    const decrypted = built.kms.decryptWithRootKey()(Buffer.from(cached.encryptedSlackClientId.data)).toString();
    expect(decrypted).toBe("slack-id");
  });

  test("should store credentials and env overrides encrypted with the root key", async () => {
    // Setup
    const built = await initialized();

    // Action
    await built.config.updateConfig({
      microsoftTeamsClientSecret: "teams-secret",
      envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "google-id" }
    });

    // Assert
    const row = await built.inMemory.dataAccess.instanceConfig.findById();
    const secret = row?.encrypted("encryptedMicrosoftTeamsClientSecret");
    const overrides = row?.encrypted("encryptedEnvOverrides");
    if (!secret || !overrides) throw new Error("Credentials were not stored");
    const decrypt = built.kms.decryptWithRootKey();
    expect(secret.toString()).not.toContain("teams-secret");
    expect(decrypt(secret).toString()).toBe("teams-secret");
    expect(JSON.parse(decrypt(overrides).toString())).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "google-id" });
  });

  test("should refuse an empty patch and change nothing", async () => {
    // Setup
    const built = await initialized();
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({});

    // Assert
    await expect(update).rejects.toThrow("No recognized instance configuration fields were provided");
    expect(built.state.tables.row).toBe(before);
  });

  test("should refuse to clear a Slack credential, name it, and change nothing", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientId: "slack-id", slackClientSecret: "slack-secret" });
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({ slackClientId: "", slackClientSecret: "new-secret" });

    // Assert
    await expect(update).rejects.toThrow("Slack client ID cannot be empty");
    expect(built.state.tables.row).toBe(before);
  });

  test("should clear a GitHub app credential given as an empty string", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ gitHubAppConnectionSlug: "my-app" });

    // Action
    await built.config.updateConfig({ gitHubAppConnectionSlug: "" });

    // Assert
    expect((await built.config.getIntegrationCredentials()).gitHubAppConnection.appSlug).toBe("");
  });

  test("should write nothing when encryption fails", async () => {
    // Setup
    const built = await initialized();
    vi.spyOn(built.kms, "encryptWithRootKey").mockImplementation(() => {
      throw new Error("root key not loaded");
    });
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({ allowSignUp: false, slackClientId: "slack-id" });

    // Assert
    await expect(update).rejects.toThrow("root key not loaded");
    expect(built.state.tables.row).toBe(before);
  });

  test("should apply env overrides to this process only after the write commits", async () => {
    // Setup
    const built = await initialized();
    const { transactionRunner } = built.inMemory;
    const run = transactionRunner.run.bind(transactionRunner);
    let effectiveDuringWrite: Record<string, string> | undefined;
    transactionRunner.run = (work) =>
      run(async (ctx) => {
        const result = await work(ctx);
        effectiveDuringWrite = { ...built.env.effective };
        return result;
      });

    // Action
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "google-id" } });

    // Assert
    expect(effectiveDuringWrite).toEqual({});
    expect(built.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "google-id" });
  });

  test("should leave the cache and env untouched when the write fails", async () => {
    // Setup
    const built = await initialized();
    await built.config.getServerConfig();
    const cachedBefore = await built.keyStore.getItem(SERVER_CONFIG_CACHE_KEY);
    built.state.tables.row = null;

    // Action
    const update = built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "google-id" } });

    // Assert
    await expect(update).rejects.toThrow();
    expect(built.env.effective).toEqual({});
    expect(await built.keyStore.getItem(SERVER_CONFIG_CACHE_KEY)).toBe(cachedBefore);
  });
});

describe("InstanceConfigService.getAdminIdentityIds", () => {
  test("should return the stored instance admin identities", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ adminIdentityIds: ["identity-1"] });

    // Action
    const ids = await built.config.getAdminIdentityIds();

    // Assert
    expect(ids).toEqual(["identity-1"]);
  });
});

describe("InstanceConfigService.getIntegrationCredentials", () => {
  test("should decrypt stored credentials and return empty strings for unset ones", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientId: "slack-id", microsoftTeamsBotId: "bot-id" });

    // Action
    const credentials = await built.config.getIntegrationCredentials();

    // Assert
    expect(credentials.slack).toEqual({ clientId: "slack-id", clientSecret: "" });
    expect(credentials.microsoftTeams).toEqual({ appId: "", clientSecret: "", botId: "bot-id" });
  });

  test("should decrypt again once another pod changed the credentials", async () => {
    // Setup
    const podA = await initialized();
    const podB = buildInMemoryInstanceConfigCore({ inMemory: podA.inMemory, keyStore: podA.keyStore, kms: podA.kms });
    await podA.config.updateConfig({ slackClientSecret: "old" });
    await podB.config.getIntegrationCredentials();

    // Action
    await podA.config.updateConfig({ slackClientSecret: "new" });

    // Assert
    expect((await podB.config.getIntegrationCredentials()).slack.clientSecret).toBe("new");
  });

  test("should not decrypt again while the row is unchanged", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientSecret: "secret" });
    await built.config.getIntegrationCredentials();
    const decrypt = vi.spyOn(built.kms, "decryptWithRootKey");

    // Action
    await built.config.getIntegrationCredentials();

    // Assert
    expect(decrypt).not.toHaveBeenCalled();
  });
});

describe("InstanceConfigService.getSlackCredentials", () => {
  test("should fall back to the env credentials when none are stored", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({
      WORKFLOW_SLACK_CLIENT_ID: "env-id",
      WORKFLOW_SLACK_CLIENT_SECRET: "env-s"
    });
    const built = await initialized({ env });

    // Action
    const credentials = await built.config.getSlackCredentials();

    // Assert
    expect(credentials).toEqual({ clientId: "env-id", clientSecret: "env-s" });
  });

  test("should prefer the stored credentials over the env ones", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({
      WORKFLOW_SLACK_CLIENT_ID: "env-id",
      WORKFLOW_SLACK_CLIENT_SECRET: "env-s"
    });
    const built = await initialized({ env });
    await built.config.updateConfig({ slackClientId: "stored-id" });

    // Action
    const credentials = await built.config.getSlackCredentials();

    // Assert
    expect(credentials).toEqual({ clientId: "stored-id", clientSecret: "env-s" });
  });

  test("should keep working when another integration's credential cannot be decrypted", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ slackClientId: "slack-id", gitHubAppConnectionPrivateKey: "key" });
    built.state.overwriteRow({ encryptedGitHubAppConnectionPrivateKey: Buffer.from("not a ciphertext") });

    // Action
    const credentials = await built.config.getSlackCredentials();

    // Assert
    expect(credentials.clientId).toBe("slack-id");
  });
});

describe("InstanceConfigService.getMicrosoftTeamsCredentials", () => {
  test("should return the row's updatedAt with the credentials", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ microsoftTeamsAppId: "app-id" });

    // Action
    const credentials = await built.config.getMicrosoftTeamsCredentials();

    // Assert
    expect(credentials.appId).toBe("app-id");
    expect(credentials.updatedAt).toEqual(built.state.tables.row?.updatedAt);
  });

  test("should read the committed row, not a stale cache entry, when asked for the primary", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ microsoftTeamsAppId: "old-app" });
    const staleEntry = await built.keyStore.getItem(SERVER_CONFIG_CACHE_KEY);
    await built.config.updateConfig({ microsoftTeamsAppId: "new-app" });
    await built.keyStore.setItemWithExpiry(SERVER_CONFIG_CACHE_KEY, 60, staleEntry as string);

    // Action
    const credentials = await built.config.getMicrosoftTeamsCredentials({ readFrom: ReadFrom.Primary });

    // Assert
    expect(credentials.appId).toBe("new-app");
  });
});

describe("InstanceConfigService.updateConfig env overrides", () => {
  test("should accept overrides with keys that cannot be overridden, and never apply those keys", async () => {
    // Setup
    const built = await initialized();

    // Action
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id", AUTH_SECRET: "nope" } });

    // Assert
    expect(built.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "id" });
  });

  test("should refuse a value the env schema rejects and store nothing", async () => {
    // Setup
    const built = await initialized();
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({ envOverrides: { DISABLE_PUBLIC_SECRET_SHARING: "maybe" } });

    // Assert
    await expect(update).rejects.toThrow('Key: "DISABLE_PUBLIC_SECRET_SHARING", Error: Expected');
    expect(built.state.tables.row).toBe(before);
  });
});

describe("InstanceConfigService.getEnvOverridesOrganized", () => {
  test("should group overrides by schema group and flag keys the process env sets", async () => {
    // Setup
    const env = new FakeInstanceConfigEnv({ CLIENT_SECRET_GOOGLE_LOGIN: "from-env" });
    const built = await initialized({ env });
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id" } });

    // Action
    const organized = await built.config.getEnvOverridesOrganized();

    // Assert
    expect(organized.google_sso).toEqual({
      name: "Google SSO",
      fields: [
        { key: "CLIENT_ID_GOOGLE_LOGIN", description: undefined, value: "id", hasEnvEntry: false },
        { key: "CLIENT_SECRET_GOOGLE_LOGIN", description: undefined, value: "", hasEnvEntry: true }
      ]
    });
  });
});

describe("InstanceConfigCoreModule.start", () => {
  test("should apply no overrides and not fail when the replica has no row yet", async () => {
    // Setup
    const built = buildInMemoryInstanceConfigCore();

    // Action
    const start = built.module.start();

    // Assert
    await expect(start).resolves.toBeDefined();
    expect(built.env.effective).toEqual({});
  });

  test("should apply the stored overrides now and on every refresh", async () => {
    // Setup
    const podA = await initialized();
    await podA.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "first" } });
    const podB = buildInMemoryInstanceConfigCore({ inMemory: podA.inMemory, keyStore: podA.keyStore, kms: podA.kms });
    await podB.module.start();
    await podA.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "second" } });

    // Action
    await podB.timers.find(({ name }) => name === "env-config-sync")?.task();

    // Assert
    expect(podB.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "second" });
  });

  test("should leave the env unchanged when the stored overrides fail to parse", async () => {
    // Setup
    const built = await initialized();
    await built.config.updateConfig({ envOverrides: { CLIENT_ID_GOOGLE_LOGIN: "id" } });
    built.state.overwriteRow({
      encryptedEnvOverrides: built.kms.encryptWithRootKey()(
        Buffer.from(JSON.stringify({ DISABLE_PUBLIC_SECRET_SHARING: "maybe" }))
      )
    });

    // Action
    await built.module.start();

    // Assert
    expect(built.env.effective).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "id" });
  });
});
