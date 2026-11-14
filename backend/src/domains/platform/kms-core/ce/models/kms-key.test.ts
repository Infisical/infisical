import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";

import { DataKey } from "./data-key";
import { KeyMaterial, KmsKeyUsage } from "./key-material";
import { KmsCiphertextUndecryptableError } from "./kms-ciphertext-undecryptable-error";
import { KmsKey } from "./kms-key";
import { KmsKeyVersion } from "./kms-key-version";
import { RootKey } from "./root-key";

const rootKey = RootKey.generate();

const internalKey = (overrides: Partial<Parameters<typeof KmsKey.createInternal>[0]> = {}) =>
  KmsKey.createInternal({
    orgId: "org",
    projectId: "project",
    name: "key",
    material: KeyMaterial.generateSymmetric(),
    rootKey,
    isReserved: false,
    ...overrides
  });

const externalKey = () =>
  KmsKey.createExternal({ orgId: "org", name: "aws", provider: "aws", encryptedProviderInputs: Buffer.alloc(1) });

const noArchived = () => Promise.resolve([] as KmsKeyVersion[]);

describe("KmsKey.createInternal", () => {
  test("should default to an Infisical-managed, exportable, unprotected key with a generated slug name", () => {
    // Setup
    const material = KeyMaterial.generateSymmetric();

    // Action
    const key = KmsKey.createInternal({ orgId: "org", material, rootKey });

    // Assert
    expect(key.toJSON()).toMatchObject({
      projectId: null,
      isReserved: true,
      isExportable: true,
      hasDeleteProtection: false,
      isDisabled: false,
      isPublicKeyPublished: false,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      internal: { version: 1, encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256 }
    });
    expect(key.name).toMatch(/^[a-z0-9]{8}$/);
  });

  test("should slugify a given name", () => {
    // Setup
    const key = internalKey({ name: "My Production Key" });

    // Action
    const { name } = key;

    // Assert
    expect(name).toBe("my-production-key");
  });

  test("should wrap the material so only the root key opens it", () => {
    // Setup
    const key = internalKey();
    const encrypt = key.encryptor(rootKey);

    // Action
    const wrongRoot = () => key.encryptor(RootKey.generate())({ plainText: Buffer.from("x") });

    // Assert
    expect(encrypt({ plainText: Buffer.from("x") }).cipherTextBlob.length).toBeGreaterThan(0);
    expect(wrongRoot).toThrow();
  });
});

describe("KmsKey.createReserved", () => {
  test("should make an AES-256 key that is reserved, exportable and has no project", () => {
    // Setup
    const key = KmsKey.createReserved({ orgId: "org", rootKey });

    // Action
    const record = key.toJSON();

    // Assert
    expect(record).toMatchObject({
      orgId: "org",
      projectId: null,
      isReserved: true,
      isExportable: true,
      hasDeleteProtection: false,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      internal: { version: 1, encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256 }
    });
    expect(key.isInfisicalManaged).toBe(true);
  });
});

describe("KmsKey.assertRotatable", () => {
  test.each([
    [
      "a reserved key",
      () => internalKey({ isReserved: true }),
      "Reserved Infisical-managed KMS keys cannot be rotated."
    ],
    [
      "a disabled key",
      () => {
        const key = internalKey();
        key.disable();
        return key;
      },
      "Key is disabled"
    ],
    ["an external key", () => externalKey(), "Cannot rotate external KMS keys from Infisical."]
  ])("should refuse %s", (_, build, message) => {
    // Setup
    const key = build();

    // Action
    const result = () => key.assertRotatable();

    // Assert
    expect(result).toThrow(RuleViolationError);
    expect(result).toThrow(message);
  });

  test("should refuse a sign-verify key", async () => {
    // Setup
    const material = await KeyMaterial.generate(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ED25519);
    const key = internalKey({ material });

    // Action
    const result = () => key.assertRotatable();

    // Assert
    expect(result).toThrow("Only encrypt-decrypt keys support rotation.");
  });
});

describe("KmsKey.rotate", () => {
  test("should archive the current material as its version and bump the version", () => {
    // Setup
    const key = internalKey();
    const before = key.toJSON().internal;

    // Action
    const archived = key.rotate(rootKey);

    // Assert
    expect(archived.toJSON()).toMatchObject({
      version: 1,
      encryptedKey: before?.encryptedKey,
      internalKmsId: before?.id
    });
    expect(key.toJSON().internal).toMatchObject({ id: before?.id, version: 2 });
    expect(key.toJSON().internal?.encryptedKey).not.toEqual(before?.encryptedKey);
  });

  test("should refuse a key that cannot rotate and leave its material alone", () => {
    // Setup
    const key = internalKey({ isReserved: true });
    const before = key.toJSON().internal;

    // Action
    const result = () => key.rotate(rootKey);

    // Assert
    expect(result).toThrow("Reserved Infisical-managed KMS keys cannot be rotated.");
    expect(key.toJSON().internal).toEqual(before);
  });

  test("should write v02 blobs with the new version once rotated, and v01 before", () => {
    // Setup
    const key = internalKey();
    const beforeBlob = key.encryptor(rootKey)({ plainText: Buffer.from("x") }).cipherTextBlob;

    // Action
    key.rotate(rootKey);
    const afterBlob = key.encryptor(rootKey)({ plainText: Buffer.from("x") }).cipherTextBlob;

    // Assert
    expect(beforeBlob.subarray(-3).toString()).toBe("v01");
    expect(afterBlob.subarray(-3).toString()).toBe("v02");
    expect(afterBlob.readUInt32BE(afterBlob.length - 7)).toBe(2);
  });
});

describe("KmsKey.decryptor", () => {
  test("should decrypt ciphertext written before and after a rotation", async () => {
    // Setup
    const key = internalKey();
    const before = key.encryptor(rootKey)({ plainText: Buffer.from("old") });
    const archived = key.rotate(rootKey);
    const after = key.encryptor(rootKey)({ plainText: Buffer.from("new") });
    const decrypt = key.decryptor(rootKey, () => Promise.resolve([archived]));

    // Action
    const results = [await decrypt(before), await decrypt(after)];

    // Assert
    expect(results.map((buffer) => buffer.toString())).toEqual(["old", "new"]);
  });

  test("should not load archived versions for ciphertext the current material opens", async () => {
    // Setup
    const key = internalKey();
    const blob = key.encryptor(rootKey)({ plainText: Buffer.from("x") });
    const loadArchived = vi.fn(noArchived);
    const decrypt = key.decryptor(rootKey, loadArchived);

    // Action
    await decrypt(blob);

    // Assert
    expect(loadArchived).not.toHaveBeenCalled();
  });

  test("should load archived versions once across several misses", async () => {
    // Setup
    const key = internalKey();
    const olderBlobs = [Buffer.from("a"), Buffer.from("b")].map((plainText) => key.encryptor(rootKey)({ plainText }));
    const archived = key.rotate(rootKey);
    const loadArchived = vi.fn(() => Promise.resolve([archived]));
    const decrypt = key.decryptor(rootKey, loadArchived);

    // Action
    const results = [await decrypt(olderBlobs[0]), await decrypt(olderBlobs[1])];

    // Assert
    expect(results.map((buffer) => buffer.toString())).toEqual(["a", "b"]);
    expect(loadArchived).toHaveBeenCalledTimes(1);
  });

  test("should let a failure loading archived versions propagate as is", async () => {
    // Setup
    const key = internalKey();
    const decrypt = key.decryptor(rootKey, () => Promise.reject(new Error("db down")));

    // Action
    const result = decrypt({ cipherTextBlob: Buffer.alloc(64, 7) });

    // Assert
    await expect(result).rejects.toThrow("db down");
  });

  test("should throw KmsCiphertextUndecryptableError when no version decrypts the ciphertext", async () => {
    // Setup
    const key = internalKey();
    const decrypt = key.decryptor(rootKey, noArchived);

    // Action
    const result = decrypt({ cipherTextBlob: Buffer.alloc(64, 7) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(KmsCiphertextUndecryptableError);
  });

  test("should still try the current material when a v02 blob names a version the key does not have", async () => {
    // Setup
    const key = internalKey();
    const blob = key.encryptor(rootKey)({ plainText: Buffer.from("x") }).cipherTextBlob;
    const naming = Buffer.concat([blob.subarray(0, -3), Buffer.from([0, 0, 0, 9]), Buffer.from("v02")]);
    const decrypt = key.decryptor(rootKey, noArchived);

    // Action
    const result = await decrypt({ cipherTextBlob: naming });

    // Assert
    expect(result.toString()).toBe("x");
  });

  test("should refuse an external key", () => {
    // Setup
    const key = externalKey();

    // Action
    const result = () => key.decryptor(rootKey, noArchived);

    // Assert
    expect(result).toThrow(RuleViolationError);
  });
});

describe("KmsKey.openDataKey and sealDataKey", () => {
  test("should open the data key it sealed", () => {
    // Setup
    const key = KmsKey.createReserved({ orgId: "org", rootKey });
    const dataKey = DataKey.generate();
    const sealed = key.sealDataKey(rootKey, dataKey);

    // Action
    const opened = key.openDataKey(rootKey, sealed);

    // Assert
    expect(opened.exportForWrapping()).toEqual(dataKey.exportForWrapping());
  });

  test("should throw KmsCiphertextUndecryptableError for a data key another key sealed", () => {
    // Setup
    const key = KmsKey.createReserved({ orgId: "org", rootKey });
    const sealedByOther = KmsKey.createReserved({ orgId: "org", rootKey }).sealDataKey(rootKey, DataKey.generate());

    // Action
    const result = () => key.openDataKey(rootKey, sealedByOther);

    // Assert
    expect(result).toThrow(KmsCiphertextUndecryptableError);
  });

  test("should open a data key sealed before a rotation once the archived versions are given", () => {
    // Setup
    const key = internalKey();
    const dataKey = DataKey.generate();
    const sealed = key.sealDataKey(rootKey, dataKey);
    const archived = key.rotate(rootKey);

    // Action
    const opened = key.openDataKey(rootKey, sealed, [archived]);

    // Assert
    expect(opened.exportForWrapping()).toEqual(dataKey.exportForWrapping());
  });
});

describe("KmsKey.assertExportable", () => {
  test.each([
    ["a reserved key", () => internalKey({ isReserved: true }), "Cannot get key material for reserved key"],
    ["an external key", () => externalKey(), "Cannot get key material for external key"],
    [
      "a key that forbids export",
      () => {
        const key = internalKey();
        key.forbidExport();
        return key;
      },
      "You are not allowed to export this key"
    ]
  ])("should refuse %s", (_, build, message) => {
    // Setup
    const key = build();

    // Action
    const result = () => key.assertExportable();

    // Assert
    expect(result).toThrow(message);
  });

  test("should name the key in a bulk export refusal", () => {
    // Setup
    const key = internalKey({ isExportable: false });

    // Action
    const result = () => key.assertExportable(" [kmsId=k1]");

    // Assert
    expect(result).toThrow("You are not allowed to export this key [kmsId=k1]");
  });

  test("should hand out the material an exportable key was created with", () => {
    // Setup
    const material = KeyMaterial.generateSymmetric();
    const key = internalKey({ material });

    // Action
    const exported = key.exportMaterial(rootKey);

    // Assert
    expect(exported).toEqual(material.exportBytes());
  });
});

describe("KmsKey.assertInOrg", () => {
  test("should answer like a missing key for another org's key", () => {
    // Setup
    const key = internalKey();

    // Action
    const result = () => key.assertInOrg("another-org");

    // Assert
    expect(result).toThrow(EntityNotFoundError);
    expect(result).toThrow("KMS ID does not belong in the organization.");
  });

  test("should accept the key's own org", () => {
    // Setup
    const key = internalKey();

    // Action
    const result = () => key.assertInOrg("org");

    // Assert
    expect(result).not.toThrow();
  });
});

describe("KmsKey delete protection", () => {
  test("should refuse deleting a protected key and allow it once unprotected", () => {
    // Setup
    const key = internalKey();
    key.protect();

    // Action
    const refused = () => key.assertDeletable();

    // Assert
    expect(refused).toThrow("has delete protection enabled");
    key.unprotect();
    expect(key.isDeletable).toBe(true);
    expect(refused).not.toThrow();
  });
});

describe("KmsKey attribute changes", () => {
  test("should change each attribute through its own method", () => {
    // Setup
    const key = internalKey();

    // Action
    key.rename("renamed");
    key.describe("described");
    key.disable();
    key.protect();
    key.forbidExport();
    key.publishPublicKey();
    key.setKmipMetadata({ kmipId: "1" });

    // Assert
    expect(key.toJSON()).toMatchObject({
      name: "renamed",
      description: "described",
      isDisabled: true,
      hasDeleteProtection: true,
      isExportable: false,
      isPublicKeyPublished: true,
      kmipMetadata: { kmipId: "1" }
    });
  });

  test("should reverse the changes that have an opposite", () => {
    // Setup
    const key = internalKey();
    key.disable();
    key.protect();
    key.forbidExport();
    key.publishPublicKey();

    // Action
    key.enable();
    key.unprotect();
    key.allowExport();
    key.unpublishPublicKey();

    // Assert
    expect(key.toJSON()).toMatchObject({
      isDisabled: false,
      hasDeleteProtection: false,
      isExportable: true,
      isPublicKeyPublished: false
    });
  });
});

describe("KmsKey external keys", () => {
  test("should replace provider inputs and expose a reference for the provider client", () => {
    // Setup
    const key = externalKey();

    // Action
    key.replaceProviderInputs(Buffer.from("new"));

    // Assert
    expect(key.isExternal).toBe(true);
    expect(key.externalRef()).toEqual({
      kmsKeyId: key.id,
      orgId: "org",
      provider: "aws",
      encryptedProviderInputs: Buffer.from("new")
    });
  });

  test("should refuse provider inputs on an internal key and have no external reference", () => {
    // Setup
    const key = internalKey();

    // Action
    const result = () => key.replaceProviderInputs(Buffer.from("new"));

    // Assert
    expect(result).toThrow(`KMS with ID '${key.id}' is not external`);
    expect(key.externalRef()).toBeNull();
  });
});

describe("KmsKey sign, verify and MAC", () => {
  test("should sign and verify with an Ed25519 key and publish its public key", async () => {
    // Setup
    const material = await KeyMaterial.generate(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ED25519);
    const key = internalKey({ material });
    const data = Buffer.from("payload");

    // Action
    const { signature } = await key.sign(rootKey, {
      data,
      signingAlgorithm: SigningAlgorithm.ED25519,
      isDigest: false
    });
    const valid = await key.verify(rootKey, {
      data,
      signature,
      signingAlgorithm: SigningAlgorithm.ED25519,
      isDigest: false
    });
    const tampered = await key.verify(rootKey, {
      data: Buffer.from("other"),
      signature,
      signingAlgorithm: SigningAlgorithm.ED25519,
      isDigest: false
    });

    // Assert
    expect(valid.signatureValid).toBe(true);
    expect(tampered.signatureValid).toBe(false);
    expect((await key.publicKey(rootKey)).length).toBeGreaterThan(0);
  });

  test("should generate and verify a MAC", async () => {
    // Setup
    const material = await KeyMaterial.generate(KmsKeyUsage.GENERATE_VERIFY_MAC, HmacAlgorithm.HMAC_SHA_256);
    const key = internalKey({ material });
    const data = Buffer.from("payload");

    // Action
    const { mac, algorithm } = key.generateMac(rootKey, data);
    const valid = key.verifyMac(rootKey, data, mac);
    const tampered = key.verifyMac(rootKey, Buffer.from("other"), mac);

    // Assert
    expect(algorithm).toBe(HmacAlgorithm.HMAC_SHA_256);
    expect(valid.macValid).toBe(true);
    expect(tampered.macValid).toBe(false);
  });

  test("should refuse signing with an encrypt-decrypt key and MAC with a signing key", async () => {
    // Setup
    const symmetric = internalKey();
    const signing = internalKey({
      material: await KeyMaterial.generate(KmsKeyUsage.SIGN_VERIFY, AsymmetricKeyAlgorithm.ED25519)
    });

    // Action
    const sign = symmetric.sign(rootKey, {
      data: Buffer.from("x"),
      signingAlgorithm: SigningAlgorithm.ED25519,
      isDigest: false
    });
    const mac = () => signing.generateMac(rootKey, Buffer.from("x"));

    // Assert
    await expect(sign).rejects.toThrow("Unsupported key type, expected sign-verify but got encrypt-decrypt");
    expect(mac).toThrow("Unsupported key type, expected generate-verify-mac but got sign-verify");
  });
});

describe("KmsKey.restore and toJSON", () => {
  test("should round-trip a record and hide material from details()", () => {
    // Setup
    const key = internalKey({ description: "d", kmipMetadata: { a: 1 } });

    // Action
    const restored = KmsKey.restore(key.toJSON());

    // Assert
    expect(restored.toJSON()).toEqual(key.toJSON());
    expect(restored.details()).toMatchObject({
      isExternal: false,
      encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      version: 1
    });
    expect(restored.details()).not.toHaveProperty("internal");
  });
});
