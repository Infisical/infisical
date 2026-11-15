import { randomUUID } from "node:crypto";

import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { RuleViolationError } from "@app/domains/lib/errors";

import { InstanceConfigCache } from "../../data-access/instance-config-cache";
import { ResolvedEnvCache } from "../../data-access/resolved-env-cache";
import { InstanceConfig } from "../../models/instance-config";
import { buildInstanceConfigCore } from "../../testing/build-instance-config-core";
import { FakeInstanceConfigEnv } from "../../testing/fake-instance-config-env";
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
    ["decrypts to something that is not JSON", (seal: (plain: Buffer) => Buffer) => seal(Buffer.from("not json"))]
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

  test("should fall back to the env defaults when the env schema no longer accepts the stored overrides", async () => {
    // Setup
    const first = await buildInstanceConfigCore();
    await first.module.instanceConfigService.updateConfig({ envOverrides: { CLIENT_ID_GITHUB_LOGIN: "from-admin" } });
    const { module } = await buildInstanceConfigCore({
      memory: first.memory,
      keyStore: first.keyStore,
      kmsCore: first.kmsCore,
      env: new FakeInstanceConfigEnv({ rejectedKeys: ["CLIENT_ID_GITHUB_LOGIN"] })
    });

    // Action
    const config = await module.instanceConfigService.getInstanceConfig();

    // Assert
    expect(config.CLIENT_ID_GITHUB_LOGIN).toBeUndefined();
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
      new FakeInstanceConfigEnv()
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

  test("should refuse overrides the env schema rejects and change nothing", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore({
      env: new FakeInstanceConfigEnv({ rejectedKeys: ["CLIENT_ID_GITHUB_LOGIN"] })
    });
    const service = module.instanceConfigService;
    const before = await service.getInstanceConfig();

    // Action
    const result = service.updateConfig({ allowSignUp: false, envOverrides: { CLIENT_ID_GITHUB_LOGIN: "x" } });

    // Assert
    await expect(result).rejects.toThrow('Key: "CLIENT_ID_GITHUB_LOGIN", Error: Invalid value');
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    expect(await service.getInstanceConfig()).toEqual(before);
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
      env: new FakeInstanceConfigEnv({ slackDefaults: { clientId: "env-id", clientSecret: "env-secret" } })
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

describe("InstanceConfigService.completeSetup", () => {
  test("should finish setup, close sign-up and grant the admin identity", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;

    // Action
    await service.completeSetup({ closeSignUp: true, adminIdentityId: "identity-1" });

    // Assert
    expect(await service.getInstanceConfig()).toMatchObject({
      initialized: true,
      allowSignUp: false,
      adminIdentityIds: ["identity-1"]
    });
  });

  test("should leave sign-up open and grant nobody when not told to", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;

    // Action
    await service.completeSetup({ closeSignUp: false });

    // Assert
    const config = await service.getInstanceConfig();
    expect(config.initialized).toBe(true);
    expect(config.allowSignUp).toBe(true);
    expect(config.adminIdentityIds).toBeNull();
  });
});

describe("InstanceConfigService.revokeAdminIdentity", () => {
  test("should remove the admin identity", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.completeSetup({ closeSignUp: false, adminIdentityId: "identity-1" });

    // Action
    await service.revokeAdminIdentity("identity-1");

    // Assert
    expect(await service.isInstanceAdminIdentity("identity-1")).toBe(false);
  });

  test("should refuse an identity that is not an admin and change nothing", async () => {
    // Setup
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.completeSetup({ closeSignUp: false, adminIdentityId: "identity-1" });

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
    const { module } = await buildInstanceConfigCore();
    const service = module.instanceConfigService;
    await service.completeSetup({ closeSignUp: false, adminIdentityId: "identity-1" });

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
      env: new FakeInstanceConfigEnv({ envKeys: ["CLIENT_ID_GOOGLE_LOGIN"] })
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
