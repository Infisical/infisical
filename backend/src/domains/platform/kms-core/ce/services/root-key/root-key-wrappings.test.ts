import { RootKey } from "../../models/root-key";
import { RootKeyConfig, RootKeyEncryptionStrategy } from "../../models/root-key-config";
import { fakeHsm, rootKeyTestEnv, rootKeyWrappingsFor } from "../../testing/root-key-fixture";

describe("RootKeyWrappings", () => {
  test("should offer software when an env key is set and HSM when its variables are", () => {
    // Setup
    const both = rootKeyWrappingsFor(rootKeyTestEnv({ isHsmConfigured: true }));
    const hsmOnly = rootKeyWrappingsFor(rootKeyTestEnv({ ENCRYPTION_KEY: undefined, isHsmConfigured: true }));

    // Action
    const offered = [both.offered(), hsmOnly.offered()];

    // Assert
    expect(offered).toEqual([
      [RootKeyEncryptionStrategy.Software, RootKeyEncryptionStrategy.HSM],
      [RootKeyEncryptionStrategy.HSM]
    ]);
  });

  test("should round-trip the root key under each strategy", async () => {
    // Setup
    const wrappings = rootKeyWrappingsFor(rootKeyTestEnv(), { rootKeyWrapper: fakeHsm({ entitled: true }) });
    const rootKey = RootKey.generate();

    // Action
    const opened = await Promise.all(
      [RootKeyEncryptionStrategy.Software, RootKeyEncryptionStrategy.HSM].map(async (strategy) => {
        const wrapping = wrappings.for(strategy);
        return wrapping.unwrap(await wrapping.wrap(rootKey));
      })
    );

    // Assert
    expect(opened.every((key) => key.equals(rootKey))).toBe(true);
  });

  test("should refuse an unknown strategy", () => {
    // Setup
    const wrappings = rootKeyWrappingsFor(rootKeyTestEnv());

    // Action
    const result = () => wrappings.for("PLAINTEXT" as RootKeyEncryptionStrategy);

    // Assert
    expect(result).toThrow("Invalid root key encryption strategy: PLAINTEXT");
  });

  test("should reject, not throw, when unwrapping a row with an unknown strategy", async () => {
    // Setup
    const wrappings = rootKeyWrappingsFor(rootKeyTestEnv());
    const row = { strategy: null, encryptedRootKey: Buffer.alloc(32) } as unknown as RootKeyConfig;

    // Action
    let result: Promise<RootKey> | undefined;
    const call = () => {
      result = wrappings.unwrap(row);
    };

    // Assert
    expect(call).not.toThrow();
    await expect(result).rejects.toThrow("Invalid root key encryption strategy: null");
  });

  test("should refuse HSM without the enterprise edition, and an HSM that is not configured", async () => {
    // Setup
    const community = rootKeyWrappingsFor(rootKeyTestEnv()).for(RootKeyEncryptionStrategy.HSM);
    const inactive = rootKeyWrappingsFor(rootKeyTestEnv(), {
      rootKeyWrapper: { ...fakeHsm({ entitled: true }), isConfigured: async () => false }
    }).for(RootKeyEncryptionStrategy.HSM);

    // Action
    const results = [community.wrap(RootKey.generate()), inactive.unwrap(Buffer.alloc(32))];

    // Assert
    await expect(results[0]).rejects.toThrow("requires the Infisical enterprise edition");
    await expect(results[1]).rejects.toThrow("Unable to decrypt root KMS key. HSM service is inactive.");
  });

  test("should label the env key, and have no label without one", () => {
    // Setup
    const withKey = rootKeyWrappingsFor(rootKeyTestEnv());
    const withoutKey = rootKeyWrappingsFor(rootKeyTestEnv({ ENCRYPTION_KEY: undefined }));

    // Action
    const labels = [withKey.currentKekLabel, withoutKey.currentKekLabel];

    // Assert
    expect(labels[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(labels[1]).toBeNull();
  });
});
