import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { KmsKey, KmsKeyUsage } from "./kms-key";

const internalKey = (overrides: Partial<Parameters<typeof KmsKey.createInternal>[0]> = {}) =>
  KmsKey.createInternal({
    orgId: "org",
    projectId: "project",
    name: "key",
    keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
    encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
    encryptedKey: Buffer.from("v1"),
    isReserved: false,
    isExportable: true,
    hasDeleteProtection: false,
    ...overrides
  });

describe("KmsKey.assertRotatable", () => {
  test.each([
    ["a reserved key", { isReserved: true }, "Reserved Infisical-managed KMS keys cannot be rotated."],
    [
      "a sign-verify key",
      { keyUsage: KmsKeyUsage.SIGN_VERIFY, encryptionAlgorithm: "RSA_4096" as never },
      "Only encrypt-decrypt keys support rotation."
    ]
  ])("should refuse %s", (_, overrides, message) => {
    // Setup
    const key = internalKey(overrides);

    // Action
    const result = () => key.assertRotatable();

    // Assert
    expect(result).toThrow(message);
  });

  test("should refuse an external key", () => {
    // Setup
    const key = KmsKey.createExternal({
      orgId: "org",
      name: "aws",
      provider: "aws",
      encryptedProviderInputs: Buffer.alloc(1)
    });

    // Action
    const result = () => key.assertRotatable();

    // Assert
    expect(result).toThrow("Cannot rotate external KMS keys from Infisical.");
  });
});

describe("KmsKey.rotate", () => {
  test("should archive the current material as its version and bump the version", () => {
    // Setup
    const key = internalKey();

    // Action
    const archived = key.rotate(Buffer.from("v2"));

    // Assert
    expect(archived.toJSON()).toMatchObject({ version: 1, encryptedKey: Buffer.from("v1") });
    expect(key.internal).toMatchObject({ version: 2, encryptedKey: Buffer.from("v2") });
  });
});

describe("KmsKey.assertExportable", () => {
  test.each([
    ["a reserved key", { isReserved: true }, "Cannot get key material for reserved key"],
    ["a non-exportable key", { isExportable: false }, "You are not allowed to export this key"]
  ])("should refuse %s", (_, overrides, message) => {
    // Setup
    const key = internalKey(overrides);

    // Action
    const result = () => key.assertExportable();

    // Assert
    expect(result).toThrow(message);
  });
});

describe("KmsKey.assertAlgorithmFits", () => {
  test("should refuse an algorithm the usage cannot use", () => {
    // Setup
    const fit = () => KmsKey.assertAlgorithmFits(KmsKeyUsage.ENCRYPT_DECRYPT, "RSA_4096" as never);

    // Action
    const result = fit;

    // Assert
    expect(result).toThrow("Unsupported encryption algorithm for encrypt/decrypt key");
  });
});
