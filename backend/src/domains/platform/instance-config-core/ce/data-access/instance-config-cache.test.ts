import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { FakeKmsCore } from "@app/domains/platform/kms-core/ce/testing/fake-kms-core";

import { InstanceConfig } from "../models/instance-config";
import { InstanceConfigCache } from "./instance-config-cache";

const CACHE_KEY = "infisical-admin-cfg";

const failingReadKeyStore = () =>
  Object.assign(new InMemoryKeyStore(), {
    getItem: async (): Promise<string | null> => {
      throw new Error("redis is down");
    }
  });

const richConfig = () =>
  InstanceConfig.restore({
    id: "00000000-0000-0000-0000-000000000000",
    instanceId: "11111111-1111-4111-8111-111111111111",
    initialized: true,
    allowSignUp: false,
    allowedSignUpDomain: "example.com",
    trustLdapEmails: true,
    defaultAuthOrgId: "22222222-2222-4222-8222-222222222222",
    enabledLoginMethods: ["email"],
    authConsentContent: "consent",
    pageFrameContent: "frame",
    adminIdentityIds: ["identity-1"],
    fipsEnabled: false,
    onboardingCompleted: true,
    allowedStorageHostnames: ["a.example.com"],
    encryptedSlackClientId: Buffer.from([1, 2, 3]),
    encryptedSlackClientSecret: Buffer.from([4, 5, 6]),
    encryptedEnvOverrides: Buffer.from([7, 8, 9]),
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-02-02T00:00:00.000Z"),
    defaultAuthOrgSlug: "org",
    defaultAuthOrgAuthEnforced: false,
    defaultAuthOrgAuthMethod: "saml"
  });

describe("InstanceConfigCache.get", () => {
  test("should return null when nothing is cached", async () => {
    // Setup
    const cache = new InstanceConfigCache(new InMemoryKeyStore());

    // Action
    const config = await cache.get();

    // Assert
    expect(config).toBeNull();
  });

  test("should return what was set, with its buffers and dates", async () => {
    // Setup
    const cache = new InstanceConfigCache(new InMemoryKeyStore());
    const config = richConfig();
    await cache.set(config);

    // Action
    const found = await cache.get();

    // Assert
    expect(found?.toJSON()).toEqual(config.toJSON());
    expect(Buffer.isBuffer(found?.toJSON().encryptedSlackClientId)).toBe(true);
  });

  test("should read a row written by the previous release", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    const previousRelease = JSON.stringify({
      id: "00000000-0000-0000-0000-000000000000",
      initialized: true,
      allowSignUp: true,
      createdAt: new Date("2029-01-01T00:00:00.000Z"),
      updatedAt: new Date("2029-02-02T00:00:00.000Z"),
      instanceId: "11111111-1111-4111-8111-111111111111",
      trustLdapEmails: false,
      encryptedSlackClientId: Buffer.from("slack-id"),
      encryptedEnvOverrides: Buffer.from("overrides"),
      fipsEnabled: false,
      onboardingCompleted: false,
      allowedSignUpDomain: undefined,
      defaultAuthOrgId: undefined
    });
    await keyStore.setItemWithExpiry(CACHE_KEY, 60, previousRelease);
    const cache = new InstanceConfigCache(keyStore);

    // Action
    const found = await cache.get();

    // Assert
    expect(found?.toJSON()).toMatchObject({
      initialized: true,
      allowSignUp: true,
      allowedSignUpDomain: null,
      defaultAuthOrgId: null,
      defaultAuthOrgSlug: null,
      createdAt: new Date("2029-01-01T00:00:00.000Z"),
      updatedAt: new Date("2029-02-02T00:00:00.000Z"),
      encryptedSlackClientId: Buffer.from("slack-id"),
      encryptedEnvOverrides: Buffer.from("overrides")
    });
  });

  test("should read as a miss when the cached value cannot be parsed", async () => {
    // Setup
    const keyStore = new InMemoryKeyStore();
    await keyStore.setItemWithExpiry(CACHE_KEY, 60, "not json");
    const cache = new InstanceConfigCache(keyStore);

    // Action
    const config = await cache.get();

    // Assert
    expect(config).toBeNull();
  });

  test("should read as a miss when Redis fails", async () => {
    // Setup
    const cache = new InstanceConfigCache(failingReadKeyStore());

    // Action
    const config = await cache.get();

    // Assert
    expect(config).toBeNull();
  });
});

// The row as the previous release's superAdminDAL.findById returned it from Postgres: every column present (null when
// unset) plus the default auth org fields its join added. withCache and updateServerCfg cached JSON.stringify of it.
const previousReleaseDalRow = (kmsCore: FakeKmsCore) => {
  const encrypt = kmsCore.kmsRootKeyService.encryptWithRootKey();
  return {
    id: "00000000-0000-0000-0000-000000000000",
    initialized: true,
    allowSignUp: false,
    createdAt: new Date("2029-01-01T00:00:00.000Z"),
    updatedAt: new Date("2029-02-02T00:00:00.000Z"),
    allowedSignUpDomain: null,
    instanceId: "11111111-1111-4111-8111-111111111111",
    trustLdapEmails: false,
    defaultAuthOrgId: "22222222-2222-4222-8222-222222222222",
    enabledLoginMethods: ["email", "saml"],
    encryptedSlackClientId: encrypt(Buffer.from("old-slack-id")),
    encryptedSlackClientSecret: encrypt(Buffer.from("old-slack-secret")),
    authConsentContent: null,
    pageFrameContent: null,
    adminIdentityIds: ["identity-1"],
    encryptedMicrosoftTeamsAppId: encrypt(Buffer.from("old-teams-app")),
    encryptedMicrosoftTeamsClientSecret: encrypt(Buffer.from("old-teams-secret")),
    encryptedMicrosoftTeamsBotId: encrypt(Buffer.from("old-teams-bot")),
    encryptedGitHubAppConnectionClientId: encrypt(Buffer.from("old-gh-client")),
    encryptedGitHubAppConnectionClientSecret: encrypt(Buffer.from("old-gh-secret")),
    encryptedGitHubAppConnectionSlug: encrypt(Buffer.from("old-gh-slug")),
    encryptedGitHubAppConnectionId: encrypt(Buffer.from("old-gh-id")),
    encryptedGitHubAppConnectionPrivateKey: encrypt(Buffer.from("old-gh-key")),
    encryptedEnvOverrides: encrypt(Buffer.from(JSON.stringify({ CLIENT_ID_GITHUB_LOGIN: "old-override" }))),
    fipsEnabled: false,
    onboardingCompleted: true,
    allowedStorageHostnames: null,
    defaultAuthOrgSlug: "acme",
    defaultAuthOrgAuthEnforced: true,
    defaultAuthOrgAuthMethod: "saml"
  };
};

// The narrowest entry an older release could have left: no joined fields, and the columns it did not know omitted.
const previousReleaseNarrowRow = (kmsCore: FakeKmsCore) => {
  const {
    defaultAuthOrgSlug,
    defaultAuthOrgAuthEnforced,
    defaultAuthOrgAuthMethod,
    allowedStorageHostnames,
    encryptedGitHubAppConnectionClientId,
    encryptedGitHubAppConnectionClientSecret,
    encryptedGitHubAppConnectionSlug,
    encryptedGitHubAppConnectionId,
    encryptedGitHubAppConnectionPrivateKey,
    allowedSignUpDomain,
    authConsentContent,
    pageFrameContent,
    ...row
  } = previousReleaseDalRow(kmsCore);
  return row;
};

describe("InstanceConfigCache.get", () => {
  test.each([
    ["the full findById row with the joined org", previousReleaseDalRow, "acme"],
    ["a row without joined fields or newer columns", previousReleaseNarrowRow, null]
  ])(
    "should read a previous release entry holding %s and decrypt its credentials",
    async (_name, buildRow, expectedSlug) => {
      // Setup
      const kmsCore = new FakeKmsCore();
      const keyStore = new InMemoryKeyStore();
      await keyStore.setItemWithExpiry(CACHE_KEY, 60, JSON.stringify(buildRow(kmsCore)));
      const cache = new InstanceConfigCache(keyStore);
      const decrypt = kmsCore.kmsRootKeyService.decryptWithRootKey();

      // Action
      const found = await cache.get();

      // Assert
      if (!found) throw new Error("cache miss");
      expect(found.slackCredentials(decrypt).toJSON()).toEqual({
        clientId: "old-slack-id",
        clientSecret: "old-slack-secret"
      });
      expect(found.microsoftTeamsCredentials(decrypt).toJSON()).toEqual({
        appId: "old-teams-app",
        clientSecret: "old-teams-secret",
        botId: "old-teams-bot"
      });
      expect(found.envOverrides(decrypt).toJSON()).toEqual({ CLIENT_ID_GITHUB_LOGIN: "old-override" });
      expect(found.isAdminIdentity("identity-1")).toBe(true);
      expect(found.toSettings()).toMatchObject({
        initialized: true,
        allowSignUp: false,
        enabledLoginMethods: ["email", "saml"],
        createdAt: new Date("2029-01-01T00:00:00.000Z"),
        updatedAt: new Date("2029-02-02T00:00:00.000Z"),
        defaultAuthOrgSlug: expectedSlug
      });
    }
  );

  test("should read the GitHub app credentials of the full previous release row", async () => {
    // Setup
    const kmsCore = new FakeKmsCore();
    const keyStore = new InMemoryKeyStore();
    await keyStore.setItemWithExpiry(CACHE_KEY, 60, JSON.stringify(previousReleaseDalRow(kmsCore)));
    const cache = new InstanceConfigCache(keyStore);

    // Action
    const found = await cache.get();

    // Assert
    expect(found?.gitHubAppCredentials(kmsCore.kmsRootKeyService.decryptWithRootKey()).toJSON()).toEqual({
      clientId: "old-gh-client",
      clientSecret: "old-gh-secret",
      appSlug: "old-gh-slug",
      appId: "old-gh-id",
      privateKey: "old-gh-key"
    });
  });
});

describe("InstanceConfigCache.set", () => {
  test("should write an entry the previous release's getServerCfg and Slack code can use", async () => {
    // Setup
    const kmsCore = new FakeKmsCore();
    const keyStore = new InMemoryKeyStore();
    const cache = new InstanceConfigCache(keyStore);
    const dalRow = previousReleaseDalRow(kmsCore);
    await cache.set(InstanceConfig.restore(dalRow));
    const decrypt = kmsCore.kmsRootKeyService.decryptWithRootKey();

    // Action
    const raw = await keyStore.getItem(CACHE_KEY);
    if (!raw) throw new Error("nothing cached");
    const parsed = JSON.parse(raw) as Record<string, unknown> & {
      createdAt: string;
      updatedAt: string;
      encryptedSlackClientId: { type: string; data: number[] };
      encryptedSlackClientSecret: { type: string; data: number[] };
    };
    const serverCfg = { ...parsed, createdAt: new Date(parsed.createdAt), updatedAt: new Date(parsed.updatedAt) };

    // Assert
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(dalRow).sort());
    expect(JSON.parse(raw)).toEqual(JSON.parse(JSON.stringify(dalRow)));
    expect(decrypt(Buffer.from(serverCfg.encryptedSlackClientId.data)).toString()).toBe("old-slack-id");
    expect(decrypt(Buffer.from(parsed.encryptedSlackClientSecret.data)).toString()).toBe("old-slack-secret");
    expect(serverCfg.createdAt.toISOString()).toBe("2029-01-01T00:00:00.000Z");
    expect(serverCfg).toMatchObject({
      adminIdentityIds: ["identity-1"],
      enabledLoginMethods: ["email", "saml"],
      defaultAuthOrgSlug: "acme",
      defaultAuthOrgAuthMethod: "saml"
    });
  });

  test("should write ciphertext columns as the Buffer JSON that Buffer.from accepts", async () => {
    // Setup
    const kmsCore = new FakeKmsCore();
    const keyStore = new InMemoryKeyStore();
    const cache = new InstanceConfigCache(keyStore);
    await cache.set(InstanceConfig.restore(previousReleaseDalRow(kmsCore)));

    // Action
    const raw = await keyStore.getItem(CACHE_KEY);
    // Typed as the previous release believed (TSuperAdmin), though at runtime the column is { type, data }.
    const parsed = JSON.parse(raw ?? "{}") as { encryptedSlackClientId: Buffer };

    // Assert
    expect(parsed.encryptedSlackClientId).toMatchObject({ type: "Buffer" });
    expect(kmsCore.kmsRootKeyService.decryptWithRootKey()(Buffer.from(parsed.encryptedSlackClientId)).toString()).toBe(
      "old-slack-id"
    );
  });
});

describe("InstanceConfigCache.setIfAbsent", () => {
  test("should write when nothing is cached", async () => {
    // Setup
    const cache = new InstanceConfigCache(new InMemoryKeyStore());

    // Action
    await cache.setIfAbsent(richConfig());

    // Assert
    expect((await cache.get())?.toJSON()).toEqual(richConfig().toJSON());
  });

  test("should keep a copy another pod wrote after its change, rather than the older row read on a miss", async () => {
    // Setup
    const cache = new InstanceConfigCache(new InMemoryKeyStore());
    const fresh = richConfig();
    fresh.changeSignUpPolicy({ allowSignUp: true });
    await cache.set(fresh);

    // Action
    await cache.setIfAbsent(richConfig());

    // Assert
    expect((await cache.get())?.toJSON().allowSignUp).toBe(true);
  });
});

describe("InstanceConfigCache.clear", () => {
  test("should drop the cached row", async () => {
    // Setup
    const cache = new InstanceConfigCache(new InMemoryKeyStore());
    await cache.set(richConfig());

    // Action
    await cache.clear();

    // Assert
    expect(await cache.get()).toBeNull();
  });
});
