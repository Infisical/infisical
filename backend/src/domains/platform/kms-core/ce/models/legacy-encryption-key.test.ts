import { KMS_LEGACY_ENCRYPTION_KEY_UUID, LegacyEncryptionKey } from "./legacy-encryption-key";
import { RootKey } from "./root-key";

describe("LegacyEncryptionKey.create and open", () => {
  test("should open to the snapshot it was created with, under the same root key", () => {
    // Setup
    const rootKey = RootKey.generate();
    const material = { current: { ENCRYPTION_KEY: "a" }, original: { ROOT_ENCRYPTION_KEY: "b" } };

    // Action
    const key = LegacyEncryptionKey.create(material, rootKey);

    // Assert
    expect(key.id).toBe(KMS_LEGACY_ENCRYPTION_KEY_UUID);
    expect(key.open(rootKey)).toEqual(material);
    expect(key.encryptedKeySnapshot.toString("utf8")).not.toContain("ENCRYPTION_KEY");
  });

  test("should not open under another root key", () => {
    // Setup
    const key = LegacyEncryptionKey.create({ current: { ENCRYPTION_KEY: "a" } }, RootKey.generate());

    // Action
    const result = () => key.open(RootKey.generate());

    // Assert
    expect(result).toThrow();
  });
});

describe("LegacyEncryptionKey.materialFromEnv", () => {
  test("should keep both the current and the pre-relabel env", () => {
    // Setup
    const input = {
      current: { ENCRYPTION_KEY: "a", ROOT_ENCRYPTION_KEY: "b", NOISE: "x" } as Record<string, string>,
      original: { ENCRYPTION_KEY: "c" }
    };

    // Action
    const material = LegacyEncryptionKey.materialFromEnv(input);

    // Assert
    expect(material).toEqual({
      current: { ENCRYPTION_KEY: "a", ROOT_ENCRYPTION_KEY: "b" },
      original: { ENCRYPTION_KEY: "c", ROOT_ENCRYPTION_KEY: undefined }
    });
  });

  test("should keep the original when only it holds a key", () => {
    // Setup
    const input = { current: {}, original: { ROOT_ENCRYPTION_KEY: "b" } };

    // Action
    const material = LegacyEncryptionKey.materialFromEnv(input);

    // Assert
    expect(material?.original?.ROOT_ENCRYPTION_KEY).toBe("b");
  });

  test("should return nothing for a pure HSM instance with no env key", () => {
    // Setup
    const input = { current: {}, original: {} };

    // Action
    const material = LegacyEncryptionKey.materialFromEnv(input);

    // Assert
    expect(material).toBeNull();
  });
});
