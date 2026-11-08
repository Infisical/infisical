import { InternalServerError } from "@app/lib/errors";

import { KmsCiphertextUndecryptableError, KmsDataKey } from "../module";
import { buildInMemoryKmsCore } from "../testing/build-kms-core";
import { kmsWireFormatFixture } from "../testing/kms-wire-format-fixture";
import { loadFixtureIntoMemory } from "../testing/load-kms-wire-format-fixture";
import { inputKeyDecryptor } from "./key-material";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const b64 = (value: string) => Buffer.from(value, "base64");

const startOnFixture = async () => {
  const fixture = kmsWireFormatFixture();
  const built = buildInMemoryKmsCore({ env: { ENCRYPTION_KEY: fixture.encryptionKey } });
  loadFixtureIntoMemory(fixture, built.state);
  await built.module.start();
  return { ...built, fixture };
};

describe("KMS wire format (legacy fixtures)", () => {
  test("should decrypt the org and project data-key ciphertext the legacy service wrote", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const { orgDataKey, projectDataKey } = fixture.vectors;

    // Action
    const org = await kms.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: orgDataKey.orgId });
    const project = await kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: projectDataKey.projectId
    });

    // Assert
    expect(org.decryptor({ cipherTextBlob: b64(orgDataKey.cipherTextBlob) })).toEqual(b64(orgDataKey.plainText));
    expect(project.decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
    expect(await project.generateSecretBlindIndex(Buffer.from(projectDataKey.blindIndexInput))).toBe(
      projectDataKey.blindIndex
    );
  });

  test("should decrypt a v01 blob from before a rotation and a v02 blob after it", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const { cmek } = fixture.vectors;

    // Action
    const decrypt = await kms.decryptWithKmsKey({ kmsId: cmek.kmsId });

    // Assert
    expect(await decrypt({ cipherTextBlob: b64(cmek.v01.cipherTextBlob) })).toEqual(b64(cmek.v01.plainText));
    expect(await decrypt({ cipherTextBlob: b64(cmek.v02.cipherTextBlob) })).toEqual(b64(cmek.v02.plainText));
  });

  test("should produce blobs the legacy layout expects: v02 with the version for a rotated key", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();

    // Action
    const { cipherTextBlob } = await (
      await kms.encryptWithKmsKey({ kmsId: fixture.vectors.cmek.kmsId })
    )({
      plainText: Buffer.from("x")
    });

    // Assert
    expect(cipherTextBlob.subarray(-3).toString()).toBe("v02");
    expect(cipherTextBlob.readUInt32BE(cipherTextBlob.length - 7)).toBe(2);
  });

  test("should open the wrapped key, root key and input key vectors", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const { wrappedKey, rootKey, inputKey } = fixture.vectors;

    // Action
    const unwrapped = await kms.unwrapKey({
      projectId: wrappedKey.projectId,
      label: wrappedKey.label,
      wrappedKey: b64(wrappedKey.wrapped),
      keyBytes: 32
    });
    const rootPlain = kms.decryptWithRootKey()(b64(rootKey.cipherTextBlob));
    const inputPlain = inputKeyDecryptor(b64(inputKey.key))({ cipherTextBlob: b64(inputKey.cipherTextBlob) });

    // Assert
    expect(unwrapped).toEqual(b64(wrappedKey.key));
    expect(rootPlain).toEqual(b64(rootKey.plainText));
    expect(inputPlain).toEqual(b64(inputKey.plainText));
  });

  test("should refuse a wrapped key opened under another label", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const { wrappedKey } = fixture.vectors;

    // Action
    const unwrapped = await kms.unwrapKey({
      projectId: wrappedKey.projectId,
      label: "another-session|v1",
      wrappedKey: b64(wrappedKey.wrapped),
      keyBytes: 32
    });

    // Assert
    expect(unwrapped).toBeNull();
  });

  test("should derive the same cookie signing key from the same root key", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();

    // Action
    const cookieKey = kms.getCookieSigningKey();

    // Assert
    expect(cookieKey).toBe(fixture.vectors.cookieSigningKey);
  });

  test("should restore the legacy backup string into a key that decrypts the project's data", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const { backup, projectDataKey } = fixture.vectors;

    // Action
    await kms.loadProjectKeyBackup(backup.projectId, backup.secretManager);
    const project = await kms.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: backup.projectId
    });

    // Assert
    expect(project.decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
  });

  test("should refuse a backup with a tampered hash and keep the current key", async () => {
    // Setup
    const { kms, fixture, state } = await startOnFixture();
    const { backup } = fixture.vectors;
    const before = state.tables.projects.get(backup.projectId)?.kmsSecretManagerKeyId;
    const tampered = `${backup.secretManager.slice(0, -1)}${backup.secretManager.endsWith("0") ? "1" : "0"}`;

    // Action
    const result = kms.loadProjectKeyBackup(backup.projectId, tampered);

    // Assert
    await expect(result).rejects.toThrow("Invalid backup");
    expect(state.tables.projects.get(backup.projectId)?.kmsSecretManagerKeyId).toBe(before);
  });

  test("should throw KmsCiphertextUndecryptableError for garbage under an internal key", async () => {
    // Setup
    const { kms, fixture } = await startOnFixture();
    const decrypt = await kms.decryptWithKmsKey({ kmsId: fixture.vectors.cmek.kmsId });

    // Action
    const result = decrypt({ cipherTextBlob: Buffer.alloc(64, 7) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(KmsCiphertextUndecryptableError);
  });

  test("should refuse to boot with an encryption key that does not open the root config, naming the known labels", async () => {
    // Setup
    const fixture = kmsWireFormatFixture();
    const built = buildInMemoryKmsCore({ env: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" } });
    loadFixtureIntoMemory(fixture, built.state);

    // Action
    const result = built.module.start();

    // Assert
    await expect(result).rejects.toBeInstanceOf(InternalServerError);
    await expect(result).rejects.toThrow(fixture.vectors.kekLabel as string);
  });
});
