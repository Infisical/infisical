import { BadRequestError, CryptographyError } from "@app/lib/errors";

import { KMS_ROOT_CONFIG_UUID, RootKeyEncryptionStrategy } from "../model/root-key-config";
import { TRootKeyWrapper } from "../module";
import { buildInMemoryKmsCore } from "../testing/build-kms-core";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// configured is read on every call, so a test can bootstrap in software and then attach the device.
const fakeHsm = ({
  entitled,
  configured = { value: true }
}: {
  entitled: boolean;
  configured?: { value: boolean };
}): TRootKeyWrapper => ({
  isConfigured: async () => configured.value,
  assertEntitled: () => {
    if (!entitled) {
      throw new BadRequestError({
        message: "Your license does not include HSM integration. Please upgrade to the Enterprise plan to use HSM."
      });
    }
  },
  randomBytes: async (length) => Buffer.alloc(length, 7),
  wrap: async (key) => Buffer.from(key).reverse(),
  unwrap: async (wrapped) => Buffer.from(wrapped).reverse()
});

describe("RootKeyService.start", () => {
  test("should bootstrap one software root config on an empty instance", async () => {
    // Setup
    const { module, state } = buildInMemoryKmsCore();

    // Action
    await module.start();

    // Assert
    expect([...state.tables.rootKeyConfigs.keys()]).toEqual([KMS_ROOT_CONFIG_UUID]);
    expect(state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID)?.encryptionStrategy).toBe(
      RootKeyEncryptionStrategy.Software
    );
  });

  test("should refuse to boot when the software strategy has no encryption key, and write nothing", async () => {
    // Setup
    const { module, state } = buildInMemoryKmsCore({ env: { ENCRYPTION_KEY: undefined } });

    // Action
    const result = module.start();

    // Assert
    await expect(result).rejects.toThrow("Please set the ENCRYPTION_KEY environment variable");
    expect(state.tables.rootKeyConfigs.size).toBe(0);
  });

  test("should refuse an encryption key that is not a base64 256-bit key in FIPS mode", async () => {
    // Setup
    const { module } = buildInMemoryKmsCore({
      env: { ENCRYPTION_KEY: undefined, ROOT_ENCRYPTION_KEY: "not-base64!" },
      isFipsEnabled: () => true
    });

    // Action
    const result = module.start();

    // Assert
    await expect(result).rejects.toBeInstanceOf(CryptographyError);
    await expect(result).rejects.toThrow("is not a base64 encoded 256-bit key");
  });

  test("should refuse to boot on an HSM root config when the instance is not entitled to HSM", async () => {
    // Setup
    const hsm = fakeHsm({ entitled: false });
    const { module, state } = buildInMemoryKmsCore({ hooks: { rootKeyWrapper: hsm } });
    const now = new Date();
    state.tables.rootKeyConfigs.set(KMS_ROOT_CONFIG_UUID, {
      id: KMS_ROOT_CONFIG_UUID,
      encryptedRootKey: await hsm.wrap(Buffer.alloc(32, 1)),
      encryptionStrategy: RootKeyEncryptionStrategy.HSM,
      createdAt: now,
      updatedAt: now
    });

    // Action
    const result = module.start();

    // Assert
    await expect(result).rejects.toThrow("Your license does not include HSM integration");
  });

  test("should give a readable error on an HSM root config without the enterprise edition", async () => {
    // Setup
    const { module, state } = buildInMemoryKmsCore();
    const now = new Date();
    state.tables.rootKeyConfigs.set(KMS_ROOT_CONFIG_UUID, {
      id: KMS_ROOT_CONFIG_UUID,
      encryptedRootKey: Buffer.alloc(48),
      encryptionStrategy: RootKeyEncryptionStrategy.HSM,
      createdAt: now,
      updatedAt: now
    });

    // Action
    const result = module.start();

    // Assert
    await expect(result).rejects.toThrow("requires the Infisical enterprise edition");
  });

  test("getCookieSigningKey should throw before the root key is loaded", () => {
    // Setup
    const { kms } = buildInMemoryKmsCore();

    // Action
    const result = () => kms.getCookieSigningKey();

    // Assert
    expect(result).toThrow("KMS root key is not loaded");
  });
});

describe("RootKeyService.updateEncryptionStrategy", () => {
  test("should refuse a change while a rotation is staged and change nothing", async () => {
    // Setup
    const configured = { value: false };
    const { module, kms, state } = buildInMemoryKmsCore({
      hooks: { rootKeyWrapper: fakeHsm({ entitled: true, configured }) }
    });
    await module.start();
    configured.value = true;
    await kms.createRotation({});
    const before = state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID);

    // Action
    const result = kms.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    await expect(result).rejects.toThrow("An encryption key rotation is still in progress");
    expect(state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID)).toEqual(before);
  });

  test("should refuse a switch to HSM when the instance is not entitled, and change nothing", async () => {
    // Setup
    const configured = { value: false };
    const { module, kms, state } = buildInMemoryKmsCore({
      hooks: { rootKeyWrapper: fakeHsm({ entitled: false, configured }) }
    });
    await module.start();
    configured.value = true;
    const before = state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID);

    // Action
    const result = kms.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    await expect(result).rejects.toThrow("Your license does not include HSM integration");
    expect(state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID)).toEqual(before);
  });

  test("should re-wrap the same root key when switching to HSM", async () => {
    // Setup
    const configured = { value: false };
    const { module, kms, state } = buildInMemoryKmsCore({
      hooks: { rootKeyWrapper: fakeHsm({ entitled: true, configured }) }
    });
    await module.start();
    configured.value = true;
    const blob = kms.encryptWithRootKey()(Buffer.from("kept"));

    // Action
    await kms.updateEncryptionStrategy(RootKeyEncryptionStrategy.HSM);

    // Assert
    expect(state.tables.rootKeyConfigs.get(KMS_ROOT_CONFIG_UUID)?.encryptionStrategy).toBe(
      RootKeyEncryptionStrategy.HSM
    );
    expect(kms.decryptWithRootKey()(blob).toString()).toBe("kept");
  });
});
