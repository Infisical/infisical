import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

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
