import { symmetricCipherService, SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";

import { kmsWireFormatFixture } from "../testing/kms-wire-format-fixture";
import { DataKey } from "./data-key";
import { KmsCiphertextUndecryptableError } from "./kms-ciphertext-undecryptable-error";
import { KmsKey, TKmsKeyRecord } from "./kms-key";
import { KmsKeyVersion } from "./kms-key-version";
import { RootKey } from "./root-key";
import { WrappedKeyPayload } from "./wrapped-key";

const b64 = (value: string) => Buffer.from(value, "base64");

type TRow = Record<string, unknown>;

// The fixture's root config wraps the root key with the instance encryption key, as every stored root key is.
const loadFixture = () => {
  const fixture = kmsWireFormatFixture();
  const kek = Buffer.from(fixture.encryptionKey, "utf8");
  const [config] = fixture.rows.kmsRootConfig;
  const rootKey = RootKey.fromBytes(
    symmetricCipherService(SymmetricKeyAlgorithm.AES_GCM_256).decrypt(config.encryptedRootKey as Buffer, kek)
  );

  const keyById = (id: string) => {
    const row = fixture.rows.kmsKeys.find((candidate) => candidate.id === id) as TRow;
    const internal = fixture.rows.internalKms.find((candidate) => candidate.kmsKeyId === id) as TRow;
    return KmsKey.restore({
      ...(row as unknown as Omit<TKmsKeyRecord, "internal" | "external">),
      internal: {
        id: internal.id as string,
        encryptedKey: internal.encryptedKey as Buffer,
        encryptionAlgorithm: internal.encryptionAlgorithm as string,
        version: internal.version as number
      },
      external: null
    });
  };

  const archivedOf = (kmsKeyId: string) => {
    const internal = fixture.rows.internalKms.find((candidate) => candidate.kmsKeyId === kmsKeyId) as TRow;
    return fixture.rows.internalKmsKeyVersions
      .filter((row) => row.internalKmsId === internal.id)
      .map((row) => KmsKeyVersion.restore(row as never));
  };

  const dataKeyOf = (kmsKeyId: string, encryptedDataKey: Buffer | null) =>
    keyById(kmsKeyId).openDataKey(rootKey, encryptedDataKey as Buffer, archivedOf(kmsKeyId));

  return { fixture, rootKey, keyById, archivedOf, dataKeyOf };
};

describe("KMS wire format (frozen fixtures)", () => {
  test("should open the root key and decrypt the root key vector", () => {
    // Setup
    const { fixture, rootKey } = loadFixture();
    const { rootKey: vector } = fixture.vectors;

    // Action
    const plain = rootKey.decrypt(b64(vector.cipherTextBlob));

    // Assert
    expect(plain).toEqual(b64(vector.plainText));
  });

  test("should decrypt the org and project data-key ciphertext the previous service wrote", async () => {
    // Setup
    const { fixture, dataKeyOf } = loadFixture();
    const { organization, project } = fixture.rows;
    const { orgDataKey, projectDataKey } = fixture.vectors;

    // Action
    const org = dataKeyOf(organization.kmsDefaultKeyId as string, organization.kmsEncryptedDataKey).toCipherPair();
    const projectPair = dataKeyOf(
      project.kmsSecretManagerKeyId as string,
      project.kmsSecretManagerEncryptedDataKey
    ).toCipherPair();

    // Assert
    expect(org.decryptor({ cipherTextBlob: b64(orgDataKey.cipherTextBlob) })).toEqual(b64(orgDataKey.plainText));
    expect(projectPair.decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
    expect(await projectPair.generateSecretBlindIndex(Buffer.from(projectDataKey.blindIndexInput))).toBe(
      projectDataKey.blindIndex
    );
  });

  test("should decrypt a v01 blob from before a rotation and a v02 blob after it", async () => {
    // Setup
    const { fixture, rootKey, keyById, archivedOf } = loadFixture();
    const { cmek } = fixture.vectors;
    const decrypt = keyById(cmek.kmsId).decryptor(rootKey, () => Promise.resolve(archivedOf(cmek.kmsId)));

    // Action
    const v01 = await decrypt({ cipherTextBlob: b64(cmek.v01.cipherTextBlob) });
    const v02 = await decrypt({ cipherTextBlob: b64(cmek.v02.cipherTextBlob) });

    // Assert
    expect(v01).toEqual(b64(cmek.v01.plainText));
    expect(v02).toEqual(b64(cmek.v02.plainText));
  });

  test("should write blobs the previous layout expects: v02 with the version for a rotated key", () => {
    // Setup
    const { fixture, rootKey, keyById } = loadFixture();

    // Action
    const { cipherTextBlob } = keyById(fixture.vectors.cmek.kmsId).encryptor(rootKey)({ plainText: Buffer.from("x") });

    // Assert
    expect(cipherTextBlob.subarray(-3).toString()).toBe("v02");
    expect(cipherTextBlob.readUInt32BE(cipherTextBlob.length - 7)).toBe(2);
  });

  test("should write v01 blobs for a key that was never rotated", () => {
    // Setup
    const { fixture, rootKey, keyById } = loadFixture();
    const neverRotated = fixture.rows.kmsKeys.find((row) => row.id !== fixture.vectors.cmek.kmsId) as TRow;

    // Action
    const { cipherTextBlob } = keyById(neverRotated.id as string).encryptor(rootKey)({ plainText: Buffer.from("x") });

    // Assert
    expect(cipherTextBlob.subarray(-3).toString()).toBe("v01");
  });

  test("should open the wrapped key vector and refuse it under another label", () => {
    // Setup
    const { fixture, dataKeyOf } = loadFixture();
    const { project } = fixture.rows;
    const { wrappedKey } = fixture.vectors;
    const { decryptor } = dataKeyOf(
      project.kmsSecretManagerKeyId as string,
      project.kmsSecretManagerEncryptedDataKey
    ).toCipherPair();

    // Action
    const payload = WrappedKeyPayload.restore(decryptor({ cipherTextBlob: b64(wrappedKey.wrapped) }));

    // Assert
    expect(payload.open(wrappedKey.label, 32)).toEqual(b64(wrappedKey.key));
    expect(payload.open("another-session|v1", 32)).toBeNull();
  });

  test("should decrypt the input key vector", () => {
    // Setup
    const { inputKey } = loadFixture().fixture.vectors;

    // Action
    const plain = DataKey.fromBytes(b64(inputKey.key)).decrypt(b64(inputKey.cipherTextBlob));

    // Assert
    expect(plain).toEqual(b64(inputKey.plainText));
  });

  test("should derive the same cookie signing key from the same root key", () => {
    // Setup
    const { fixture, rootKey } = loadFixture();

    // Action
    const cookieKey = rootKey.cookieSigningKey();

    // Assert
    expect(cookieKey).toBe(fixture.vectors.cookieSigningKey);
  });

  test("should throw KmsCiphertextUndecryptableError for garbage under an internal key", async () => {
    // Setup
    const { fixture, rootKey, keyById, archivedOf } = loadFixture();
    const { kmsId } = fixture.vectors.cmek;
    const decrypt = keyById(kmsId).decryptor(rootKey, () => Promise.resolve(archivedOf(kmsId)));

    // Action
    const result = decrypt({ cipherTextBlob: Buffer.alloc(64, 7) });

    // Assert
    await expect(result).rejects.toBeInstanceOf(KmsCiphertextUndecryptableError);
  });

  test("should re-seal a data key so the previous layout can open it again", () => {
    // Setup
    const { fixture, rootKey, keyById, dataKeyOf } = loadFixture();
    const { organization } = fixture.rows;
    const orgKey = keyById(organization.kmsDefaultKeyId as string);
    const dataKey = dataKeyOf(organization.kmsDefaultKeyId as string, organization.kmsEncryptedDataKey);

    // Action
    const resealed = orgKey.sealDataKey(rootKey, dataKey);

    // Assert
    expect(resealed.subarray(-3).toString()).toBe("v01");
    const reopened = orgKey.openDataKey(rootKey, resealed).toCipherPair();
    expect(reopened.decryptor({ cipherTextBlob: b64(fixture.vectors.orgDataKey.cipherTextBlob) })).toEqual(
      b64(fixture.vectors.orgDataKey.plainText)
    );
  });

  test("should open the data key inside the previous layout's backup string", () => {
    // Setup
    const { fixture, rootKey, keyById, archivedOf } = loadFixture();
    const { backup, projectDataKey } = fixture.vectors;
    const [version, projectId, scope, kmsKeyId, encryptedDataKey] = backup.secretManager.split(".");

    // Action
    const dataKey = keyById(kmsKeyId).openDataKey(rootKey, b64(encryptedDataKey), archivedOf(kmsKeyId));

    // Assert
    expect([version, projectId, scope]).toEqual(["v1", backup.projectId, "secretManager"]);
    expect(dataKey.toCipherPair().decryptor({ cipherTextBlob: b64(projectDataKey.cipherTextBlob) })).toEqual(
      b64(projectDataKey.plainText)
    );
  });
});
