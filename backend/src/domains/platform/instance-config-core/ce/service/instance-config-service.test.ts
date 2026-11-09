import { InMemoryKeyStore } from "@app/domains/lib/testing/in-memory-key-store";

import { SERVER_CONFIG_CACHE_KEY } from "../data-access/server-config-cache";
import { buildInMemoryInstanceConfigCore } from "../testing/build-instance-config-core";

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
    const row = built.state.tables.row as {
      encryptedMicrosoftTeamsClientSecret: Buffer;
      encryptedEnvOverrides: Buffer;
    };
    const decrypt = built.kms.decryptWithRootKey();
    expect(row.encryptedMicrosoftTeamsClientSecret.toString()).not.toContain("teams-secret");
    expect(decrypt(row.encryptedMicrosoftTeamsClientSecret).toString()).toBe("teams-secret");
    expect(JSON.parse(decrypt(row.encryptedEnvOverrides).toString())).toEqual({ CLIENT_ID_GOOGLE_LOGIN: "google-id" });
  });

  test("should refuse an empty patch and change nothing", async () => {
    // Setup
    const built = await initialized();
    const before = built.state.tables.row;

    // Action
    const update = built.config.updateConfig({ slackClientId: "" });

    // Assert
    await expect(update).rejects.toThrow("No recognized instance configuration fields were provided");
    expect(built.state.tables.row).toBe(before);
  });

  test("should write nothing when encryption fails", async () => {
    // Setup
    const built = await initialized();
    built.kms.encryptWithRootKey = () => {
      throw new Error("root key not loaded");
    };
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
