import { randomUUID } from "node:crypto";

import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";

import { InstanceConfigCache } from "../../data-access/instance-config-cache";
import { ResolvedEnvCache } from "../../data-access/resolved-env-cache";
import { EnvOverrides } from "../../models/env-overrides";
import { InstanceConfig } from "../../models/instance-config";
import { buildInstanceConfigCore } from "../../testing/build-instance-config-core";
import { InMemoryInstanceConfigStore } from "../../testing/in-memory-instance-config-store";
import { TInstanceConfigStore } from "../dependencies";
import { InstanceConfigService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const CACHE_KEY = "infisical-admin-cfg";

const EMPTY_PATCH_MESSAGE =
  "No recognized instance configuration fields were provided. Settings that have been removed are no longer accepted.";

class LaggingReplicaStore implements TInstanceConfigStore {
  constructor(private readonly primary: InMemoryInstanceConfigStore) {}

  async find(options?: TReadOptions) {
    return options?.readFrom === ReadFrom.Primary ? this.primary.find() : null;
  }

  findForUpdate = () => this.primary.findForUpdate();

  createIfMissing = (config: InstanceConfig) => this.primary.createIfMissing(config);

  save = (config: InstanceConfig) => this.primary.save(config);
}

// Setup as the super admin service runs it: inside a transaction, then the shared copy refreshed after the commit.
const setUpInstance = async (
  { module, memory }: Awaited<ReturnType<typeof buildInstanceConfigCore>>,
  input: { closeSignUp: boolean; adminIdentityId?: string }
) => {
  await memory.transactionRunner.run(({ tx }) => module.instanceConfigService.within(tx).completeSetup(input));
  await module.instanceConfigService.refreshSharedCopy();
};

describe("InstanceConfigService.getInstanceConfig", () => {
  test("should return the settings merged with the resolved env", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();

    // Action
    const config = await module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(config).toMatchObject({
      initialized: false,
      allowSignUp: true,
      DISABLE_PUBLIC_SECRET_SHARING: false,
      CLIENT_GITLAB_LOGIN_URL: "https://gitlab.com"
    });
  });

  test("should return the override in place of the env value", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.updateConfig({
      envOverrides: { CLIENT_ID_GITHUB_LOGIN: "from-admin", DISABLE_PUBLIC_SECRET_SHARING: "true" }
    });

    // Action
    const config = await service.getInstanceConfig();

    // Assert
    expect(config.CLIENT_ID_GITHUB_LOGIN).toBe("from-admin");
    expect(config.DISABLE_PUBLIC_SECRET_SHARING).toBe(true);
  });

  test.each([
    ["cannot be decrypted", () => Buffer.from("not a ciphertext")],
    ["decrypts to something that is not JSON", (encrypt: (plain: Buffer) => Buffer) => encrypt(Buffer.from("not json"))]
  ])("should fall back to the env defaults when the stored overrides %s", async (_name, makeColumn) => {
    // Setup
    const { module, memory, kmsCore } = await buildInstanceConfigCore();
    const row = await memory.instanceConfigStore.find();
    if (!row) throw new Error("row missing");
    memory.instanceConfigStore.seed(
      InstanceConfig.restore({
        ...row.toJSON(),
        encryptedEnvOverrides: makeColumn(kmsCore.kmsRootKeyService.encryptWithRootKey())
      })
    );

    // Action
    const config = await module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(config.CLIENT_ID_GITHUB_LOGIN).toBeUndefined();
    expect(config.initialized).toBe(false);
  });

  test("should read the primary when the replica has not got the row yet", async () => {
    // Setup
    const { memory, keyStore, kmsCore } = await buildInstanceConfigCore();
    const service = new InstanceConfigService(
      memory.transactionRunner,
      new LaggingReplicaStore(memory.instanceConfigStore),
      new InstanceConfigCache(keyStore),
      new ResolvedEnvCache(),
      kmsCore.kmsRootKeyService,
      {}
    );
    await keyStore.deleteItem(CACHE_KEY);

    // Action
    const config = await service.getInstanceConfig();

    // Assert
    expect(config.id).toBeDefined();
    expect(config.initialized).toBe(false);
  });
});

describe("InstanceConfigService.updateConfig", () => {
  test("should apply the patch and return the settings", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();

    // Action
    const settings = await module.instanceConfigService.updateConfig({
      allowSignUp: false,
      enabledLoginMethods: ["email"],
      authConsentContent: "consent"
    });

    // Assert
    expect(settings).toMatchObject({
      allowSignUp: false,
      enabledLoginMethods: ["email"],
      authConsentContent: "consent"
    });
    expect(await module.instanceConfigService.getInstanceConfig()).toMatchObject({ allowSignUp: false });
  });

  test.each([[{}], [{ allowSignUp: undefined }]])(
    "should refuse the empty patch %j and change nothing",
    async (patch) => {
      // Setup
      const { module } = await buildInstanceConfigCore();
      const before = await module.instanceConfigService.getInstanceConfig();

      // Action
      const result = module.instanceConfigService.updateConfig(patch);

      // Assert
      await expect(result).rejects.toThrow(EMPTY_PATCH_MESSAGE);
      expect(await module.instanceConfigService.getInstanceConfig()).toEqual(before);
    }
  );

  test("should drop the env overrides an admin cannot override", async () => {
    // Setup
    const { module, memory, kmsCore } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;

    // Action
    await service.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "from-admin", SALT_ROUNDS: "11" } });

    // Assert
    const row = await memory.instanceConfigStore.find();
    if (!row) throw new Error("row missing");
    expect(row.envOverrides(kmsCore.kmsRootKeyService.decryptWithRootKey()).toJSON()).toEqual({
      CLIENT_ID_GITHUB_LOGIN: "from-admin"
    });
  });

  test("should rewrite the shared copy so another pod sees the change", async () => {
    // Setup
    const podA = await buildInstanceConfigCore();
    const podB = await buildInstanceConfigCore({ memory: podA.memory, keyStore: podA.keyStore, kmsCore: podA.kmsCore });
    await podB.module.instanceConfigService.getInstanceConfig();

    // Action
    await podA.module.instanceConfigService.updateConfig({ pageFrameContent: "from pod a" });

    // Assert
    expect((await podB.module.instanceConfigService.getInstanceConfig()).pageFrameContent).toBe("from pod a");
  });

  test("should leave the shared copy untouched when the update fails", async () => {
    // Setup
    const { module, keyStore } = await buildInstanceConfigCore();
    await module.instanceConfigService.getInstanceConfig();
    const cached = await keyStore.getItem(CACHE_KEY);

    // Action
    const result = module.instanceConfigService.updateConfig({ allowSignUp: false, enabledLoginMethods: [] });

    // Assert
    await expect(result).rejects.toThrow("At least one login method should be enabled.");
    expect(await keyStore.getItem(CACHE_KEY)).toBe(cached);
    expect((await module.instanceConfigService.getInstanceConfig()).allowSignUp).toBe(true);
  });

  test("should return the slug and sso method of the default auth org it names", async () => {
    // Setup
    const { module, memory } = await buildInstanceConfigCore();
    const orgId = randomUUID();
    memory.instanceConfigStore.addOrg({ id: orgId, slug: "acme", authEnforced: true, authMethod: "saml" });

    // Action
    const settings = await module.instanceConfigService.updateConfig({ defaultAuthOrgId: orgId });

    // Assert
    expect(settings).toMatchObject({
      defaultAuthOrgId: orgId,
      defaultAuthOrgSlug: "acme",
      defaultAuthOrgAuthEnforced: true,
      defaultAuthOrgAuthMethod: "saml"
    });
  });

  test("should refuse an empty Slack client id by name and change nothing", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.updateConfig({ slackClientId: "id" });

    // Action
    const result = service.updateConfig({ allowSignUp: false, slackClientId: "" });

    // Assert
    await expect(result).rejects.toThrow("Slack client ID cannot be empty");
    expect((await service.getSlackCredentials()).clientId).toBe("id");
    expect((await service.getInstanceConfig()).allowSignUp).toBe(true);
  });

  test("should store an empty GitHub app value and read it back as empty", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.updateConfig({ gitHubAppConnectionSlug: "slug" });

    // Action
    await service.updateConfig({ gitHubAppConnectionSlug: "" });

    // Assert
    expect((await service.getIntegrationCredentials()).gitHubAppConnection.appSlug).toBe("");
  });
});

describe("InstanceConfigService.getSlackCredentials", () => {
  test("should fall back to the env defaults for what the instance has not stored", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore({
      processEnv: { WORKFLOW_SLACK_CLIENT_ID: "env-id", WORKFLOW_SLACK_CLIENT_SECRET: "env-secret" }
    });
    const service = module.instanceConfigService;
    await service.updateConfig({ slackClientId: "stored-id" });

    // Action
    const credentials = await service.getSlackCredentials();

    // Assert
    expect(credentials.toJSON()).toEqual({ clientId: "stored-id", clientSecret: "env-secret" });
  });
});

describe("InstanceConfigService.getMicrosoftTeamsCredentials", () => {
  test("should ignore a stale shared copy when reading from the primary", async () => {
    // Setup
    const { module, memory, kmsCore } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.getInstanceConfig();
    const row = await memory.instanceConfigStore.find();
    if (!row) throw new Error("row missing");
    row.changeMicrosoftTeamsCredentials(
      { appId: "app", clientSecret: "secret", botId: "bot" },
      kmsCore.kmsRootKeyService.encryptWithRootKey()
    );
    await memory.instanceConfigStore.save(row);

    // Action
    const stale = await service.getMicrosoftTeamsCredentials();
    const fresh = await service.getMicrosoftTeamsCredentials({ readFrom: ReadFrom.Primary });

    // Assert
    expect(stale.credentials.isComplete()).toBe(false);
    expect(fresh.credentials.toJSON()).toEqual({ appId: "app", clientSecret: "secret", botId: "bot" });
  });

  test("should report the config's updatedAt, which moves with every update", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    const before = await service.getMicrosoftTeamsCredentials();

    // Action
    await service.updateConfig({ microsoftTeamsAppId: "app" });
    const after = await service.getMicrosoftTeamsCredentials();

    // Assert
    expect(after.configUpdatedAt.getTime()).toBeGreaterThanOrEqual(before.configUpdatedAt.getTime());
    expect(after.credentials.appId).toBe("app");
  });
});

describe("InstanceConfigService.within", () => {
  test("should finish setup, close sign-up and grant the admin identity", async () => {
    // Setup
    const core = await buildInstanceConfigCore();

    // Action
    await setUpInstance(core, { closeSignUp: true, adminIdentityId: "identity-1" });

    // Assert
    expect(await core.module.instanceConfigService.getInstanceConfig()).toMatchObject({
      initialized: true,
      allowSignUp: false,
      adminIdentityIds: ["identity-1"]
    });
  });

  test("should leave sign-up open and grant nobody when not told to", async () => {
    // Setup
    const core = await buildInstanceConfigCore();

    // Action
    await setUpInstance(core, { closeSignUp: false });

    // Assert
    const config = await core.module.instanceConfigService.getInstanceConfig();
    expect(config.initialized).toBe(true);
    expect(config.allowSignUp).toBe(true);
    expect(config.adminIdentityIds).toBeNull();
  });

  test("should refuse to claim or complete setup of an instance already set up", async () => {
    // Setup
    const core = await buildInstanceConfigCore();
    await setUpInstance(core, { closeSignUp: false, adminIdentityId: "identity-1" });
    const { module, memory } = core;

    // Action
    const claim = memory.transactionRunner.run(({ tx }) => module.instanceConfigService.within(tx).claimSetup());
    const complete = memory.transactionRunner.run(({ tx }) =>
      module.instanceConfigService.within(tx).completeSetup({ closeSignUp: false, adminIdentityId: "identity-2" })
    );

    // Assert
    await expect(claim).rejects.toThrow("Instance has already been set up");
    await expect(complete).rejects.toThrow("Instance has already been set up");
    expect((await memory.instanceConfigStore.find())?.toJSON().adminIdentityIds).toEqual(["identity-1"]);
  });

  test("should leave the instance not set up when the caller's transaction fails", async () => {
    // Setup
    const { module, memory } = await buildInstanceConfigCore();

    // Action
    const result = memory.transactionRunner.run(async ({ tx }) => {
      const instanceConfig = module.instanceConfigService.within(tx);
      await instanceConfig.claimSetup();
      await instanceConfig.completeSetup({ closeSignUp: true, adminIdentityId: "identity-1" });
      throw new Error("creating the first organization failed");
    });

    // Assert
    await expect(result).rejects.toThrow("creating the first organization failed");
    expect(await module.instanceConfigService.getInstanceConfig()).toMatchObject({
      initialized: false,
      allowSignUp: true,
      adminIdentityIds: null
    });
  });
});

describe("InstanceConfigService.revokeAdminIdentity", () => {
  test("should remove the admin identity", async () => {
    // Setup
    const core = await buildInstanceConfigCore();
    const { module } = core;
    const service = module.instanceConfigService;
    await setUpInstance(core, { closeSignUp: false, adminIdentityId: "identity-1" });

    // Action
    await service.revokeAdminIdentity("identity-1");

    // Assert
    expect(await service.isInstanceAdminIdentity("identity-1")).toBe(false);
  });

  test("should refuse an identity that is not an admin and change nothing", async () => {
    // Setup
    const core = await buildInstanceConfigCore();
    const { module } = core;
    const service = module.instanceConfigService;
    await setUpInstance(core, { closeSignUp: false, adminIdentityId: "identity-1" });

    // Action
    const result = service.revokeAdminIdentity("identity-2");

    // Assert
    await expect(result).rejects.toThrow("Identity does not have super admin access");
    expect(await service.isInstanceAdminIdentity("identity-1")).toBe(true);
  });
});

describe("InstanceConfigService.isInstanceAdminIdentity", () => {
  test("should be true only for a granted identity", async () => {
    // Setup
    const core = await buildInstanceConfigCore();
    const { module } = core;
    const service = module.instanceConfigService;
    await setUpInstance(core, { closeSignUp: false, adminIdentityId: "identity-1" });

    // Action
    const results = [
      await service.isInstanceAdminIdentity("identity-1"),
      await service.isInstanceAdminIdentity("other")
    ];

    // Assert
    expect(results).toEqual([true, false]);
  });
});

describe("InstanceConfigService.getEnvOverridesOrganized", () => {
  test("should show the stored override and whether the process env sets the key", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore({
      processEnv: { CLIENT_ID_GOOGLE_LOGIN: "from-env" }
    });
    const service = module.instanceConfigService;
    await service.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "from-admin" } });

    // Action
    const organized = await service.getEnvOverridesOrganized();

    // Assert
    const fields = Object.values(organized).flatMap((group) => group.fields);
    expect(fields.find((field) => field.key === "CLIENT_ID_GITHUB_LOGIN")).toMatchObject({
      value: "from-admin",
      hasEnvEntry: false
    });
    expect(fields.find((field) => field.key === "CLIENT_ID_GOOGLE_LOGIN")).toMatchObject({
      value: "",
      hasEnvEntry: true
    });
  });
});

// Two pods on one database and one Redis, each with its own process memo. Both are built before anything is read,
// because building a module drops the shared copy.
const buildTwoPods = async (processEnv: Record<string, string> = {}) => {
  const podA = await buildInstanceConfigCore({ processEnv });
  const podB = await buildInstanceConfigCore({
    memory: podA.memory,
    keyStore: podA.keyStore,
    kmsCore: podA.kmsCore,
    processEnv
  });
  return { podA, podB };
};

describe("InstanceConfigService.refreshSharedCopy", () => {
  test("should show a setup committed in a caller's transaction on another pod", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods();
    await podB.module.instanceConfigService.getInstanceConfig();
    await podA.memory.transactionRunner.run(({ tx }) =>
      podA.module.instanceConfigService.within(tx).completeSetup({ closeSignUp: true })
    );
    const beforeRefresh = await podB.module.instanceConfigService.getInstanceConfig();

    // Action
    await podA.module.instanceConfigService.refreshSharedCopy();

    // Assert
    expect(beforeRefresh.initialized).toBe(false);
    expect((await podB.module.instanceConfigService.getInstanceConfig()).initialized).toBe(true);
  });
});

describe("InstanceConfigService.getInstanceConfig", () => {
  test("should show overrides another pod changed once the shared copy changes", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods({ CLIENT_ID_GITHUB_LOGIN: "from-env" });
    const before = await podB.module.instanceConfigService.getInstanceConfig();

    // Action
    await podA.module.instanceConfigService.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "first" } });
    const afterFirst = await podB.module.instanceConfigService.getInstanceConfig();
    await podA.module.instanceConfigService.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "second" } });
    const afterSecond = await podB.module.instanceConfigService.getInstanceConfig();
    await podA.module.instanceConfigService.updateConfig({ envOverrides: {} });
    const afterClear = await podB.module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(before.CLIENT_ID_GITHUB_LOGIN).toBe("from-env");
    expect(afterFirst.CLIENT_ID_GITHUB_LOGIN).toBe("first");
    expect(afterSecond.CLIENT_ID_GITHUB_LOGIN).toBe("second");
    expect(afterClear.CLIENT_ID_GITHUB_LOGIN).toBe("from-env");
  });

  test("should show overrides a previous release pod wrote to the shared copy", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods();
    await podB.module.instanceConfigService.getInstanceConfig();
    const row = await podA.memory.instanceConfigStore.find();
    if (!row) throw new Error("row missing");
    const encrypt = podA.kmsCore.kmsRootKeyService.encryptWithRootKey();
    const previousReleaseEntry = JSON.stringify({
      ...row.toJSON(),
      encryptedEnvOverrides: encrypt(Buffer.from(JSON.stringify({ DISABLE_PUBLIC_SECRET_SHARING: "true" })))
    });

    // Action
    await podA.keyStore.setItemWithExpiry(CACHE_KEY, 60, previousReleaseEntry);
    const config = await podB.module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(config.DISABLE_PUBLIC_SECRET_SHARING).toBe(true);
  });

  test("should show overrides changed in the row once the shared copy expires", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods();
    await podB.module.instanceConfigService.getInstanceConfig();
    const row = await podA.memory.instanceConfigStore.find();
    if (!row) throw new Error("row missing");
    row.replaceEnvOverrides(
      EnvOverrides.create({ CLIENT_ID_GOOGLE_LOGIN: "written-elsewhere" }),
      podA.kmsCore.kmsRootKeyService.encryptWithRootKey()
    );
    await podA.memory.instanceConfigStore.save(row);
    const stale = await podB.module.instanceConfigService.getInstanceConfig();

    // Action
    await podA.keyStore.deleteItem(CACHE_KEY);
    const fresh = await podB.module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(stale.CLIENT_ID_GOOGLE_LOGIN).toBeUndefined();
    expect(fresh.CLIENT_ID_GOOGLE_LOGIN).toBe("written-elsewhere");
  });
});

describe("InstanceConfigService.updateConfig", () => {
  test("should clear every stored env override when given an empty object", async () => {
    // Setup
    const { module, memory, kmsCore } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.updateConfig({
      envOverrides: { CLIENT_ID_GITHUB_LOGIN: "a", DISABLE_PUBLIC_SECRET_SHARING: "true" }
    });

    // Action
    await service.updateConfig({ envOverrides: {} });

    // Assert
    const row = await memory.instanceConfigStore.find();
    expect(row?.envOverrides(kmsCore.kmsRootKeyService.decryptWithRootKey()).toJSON()).toEqual({});
    const config = await service.getInstanceConfig();
    expect(config.CLIENT_ID_GITHUB_LOGIN).toBeUndefined();
    expect(config.DISABLE_PUBLIC_SECRET_SHARING).toBe(false);
  });

  test("should store nothing for an env override key an admin cannot override", async () => {
    // Setup
    const { module, memory, kmsCore } = await buildInstanceConfigCore({ processEnv: { SALT_ROUNDS: "12" } });
    const service = module.instanceConfigService;

    // Action
    await service.updateConfig({ envOverrides: { NOT_OVERRIDABLE: "x", SALT_ROUNDS: "4" } });

    // Assert
    const row = await memory.instanceConfigStore.find();
    expect(row?.envOverrides(kmsCore.kmsRootKeyService.decryptWithRootKey()).toJSON()).toEqual({});
    expect(await service.getEnvOverridesOrganized()).not.toHaveProperty("NOT_OVERRIDABLE");
  });

  test("should refuse a patch whose only field is undefined env overrides", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();

    // Action
    const result = module.instanceConfigService.updateConfig({ envOverrides: undefined });

    // Assert
    await expect(result).rejects.toThrow(EMPTY_PATCH_MESSAGE);
  });

  test("should leave the row and the shared copy unchanged when part of the patch is refused", async () => {
    // Setup
    const { module, memory, keyStore } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.updateConfig({ slackClientId: "id", envOverrides: { CLIENT_ID_GITHUB_LOGIN: "kept" } });
    const rowBefore = (await memory.instanceConfigStore.find())?.toJSON();
    const cachedBefore = await keyStore.getItem(CACHE_KEY);

    // Action
    const result = service.updateConfig({
      envOverrides: { CLIENT_ID_GITHUB_LOGIN: "replaced" },
      pageFrameContent: "frame",
      slackClientId: ""
    });

    // Assert
    await expect(result).rejects.toThrow("Slack client ID cannot be empty");
    expect((await memory.instanceConfigStore.find())?.toJSON()).toEqual(rowBefore);
    expect(await keyStore.getItem(CACHE_KEY)).toBe(cachedBefore);
    const config = await service.getInstanceConfig();
    expect(config.CLIENT_ID_GITHUB_LOGIN).toBe("kept");
    expect(config.pageFrameContent).toBeNull();
  });
});

describe("InstanceConfigService.isInstanceAdminIdentity", () => {
  test("should be false on another pod once the identity is revoked", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods();
    await setUpInstance(podA, { closeSignUp: false, adminIdentityId: "identity-1" });
    const before = await podB.module.instanceConfigService.isInstanceAdminIdentity("identity-1");

    // Action
    await podA.module.instanceConfigService.revokeAdminIdentity("identity-1");

    // Assert
    expect(before).toBe(true);
    expect(await podB.module.instanceConfigService.isInstanceAdminIdentity("identity-1")).toBe(false);
  });

  test("should refuse a second revoke on another pod even while its copy is stale", async () => {
    // Setup
    const { podA, podB } = await buildTwoPods();
    await setUpInstance(podA, { closeSignUp: false, adminIdentityId: "identity-1" });
    await podB.module.instanceConfigService.isInstanceAdminIdentity("identity-1");
    const staleEntry = await podA.keyStore.getItem(CACHE_KEY);
    await podA.module.instanceConfigService.revokeAdminIdentity("identity-1");
    if (staleEntry) await podA.keyStore.setItemWithExpiry(CACHE_KEY, 60, staleEntry);

    // Action
    const result = podB.module.instanceConfigService.revokeAdminIdentity("identity-1");

    // Assert
    await expect(result).rejects.toThrow("Identity does not have super admin access");
  });
});
