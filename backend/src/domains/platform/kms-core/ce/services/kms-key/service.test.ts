import { ReadFrom } from "@app/domains/lib/data-access";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";

import { DataKey, TCipherPair } from "../../models/data-key";
import { KmsKey, KmsKeyUsage } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { TExternalKmsHook } from "../dependencies";
import { KeyCipher } from "../helpers/key-cipher";
import { KmsKeyService } from "./service";

const setup = (options: { withHook?: boolean } = {}) => {
  const memory = new InMemoryKmsCoreStores();
  const rootKey = RootKey.generate();
  const orgDataKey = DataKey.generate();

  const encrypt = vi.fn(async (_ref: unknown, _cipher: TCipherPair, plainText: Buffer) =>
    Buffer.concat([Buffer.from("ext:"), plainText])
  );
  const decrypt = vi.fn(async (_ref: unknown, _cipher: TCipherPair, blob: Buffer) => Buffer.from(blob.subarray(4)));
  const hook: TExternalKmsHook = { assertInputsAllowed: async () => {}, encrypt, decrypt };

  const service = new KmsKeyService(
    memory.transactionRunner,
    memory.stores,
    rootKey,
    new KeyCipher(memory.stores, rootKey, options.withHook === false ? undefined : hook)
  );

  const seedOrgKey = async (orgId: string) => {
    const wrapper = KmsKey.createReserved({ orgId, rootKey });
    await memory.kmsKeyStore.insert(wrapper);
    memory.platformRows.orgs.set(orgId, {
      id: orgId,
      kmsDefaultKeyId: wrapper.id,
      kmsEncryptedDataKey: wrapper.sealDataKey(rootKey, orgDataKey) as Buffer
    });
  };

  const seedExternalKey = async (orgId: string, name = "aws-key") => {
    const key = KmsKey.createExternal({
      orgId,
      name,
      provider: "aws",
      encryptedProviderInputs: Buffer.alloc(1),
      providerInputsVersion: 2
    });
    await memory.kmsKeyStore.insert(key);
    return key;
  };

  return { service, memory, hookCalls: { encrypt }, seedOrgKey, seedExternalKey };
};

const orgId = () => crypto.randomUUID();
const customerKey = (org: string, project: string, name = "key") => ({
  orgId: org,
  projectId: project,
  name,
  isReserved: false
});

describe("KmsKeyService.generateKmsKey", () => {
  test("should store a customer key and return its record without exposing a plaintext key", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();

    // Action
    const record = await service.generateKmsKey({ ...customerKey(org, "p1"), name: "My Key" });

    // Assert
    expect(record).toMatchObject({ name: "my-key", orgId: org, projectId: "p1", isReserved: false });
    expect(await memory.stores.kmsKeyStore.findById(record.id)).not.toBeNull();
  });

  test("should write a new key and its material in one transaction and return it without material", async () => {
    // Setup
    const { service, memory } = setup();
    const run = vi.spyOn(memory.transactionRunner, "run");

    // Action
    const generated = await service.generateKmsKey(customerKey(orgId(), "p1", "atomic"));
    const imported = await service.importKeyMaterial({
      key: Buffer.alloc(32, 1),
      algorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      name: "imported",
      isReserved: false,
      projectId: "p1",
      orgId: generated.orgId,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT
    });

    // Assert
    expect(run).toHaveBeenCalledTimes(2);
    expect(generated).not.toHaveProperty("internal");
    expect(imported).not.toHaveProperty("internal");
    expect(generated).toMatchObject({ isExternal: false, version: 1 });
  });

  test("should leave a duplicate key name to the unique index and store nothing", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();
    await service.generateKmsKey(customerKey(org, "p1", "dup"));

    // Action
    const result = service.generateKmsKey(customerKey(org, "p1", "dup"));

    // Assert
    await expect(result).rejects.toThrow("duplicate key value violates unique constraint");
    expect(await memory.stores.kmsKeyStore.find({ orgId: org })).toHaveLength(1);
  });

  test("should allow the same name in another project", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    await service.generateKmsKey(customerKey(org, "p1", "same"));

    // Action
    const other = await service.generateKmsKey(customerKey(org, "p2", "same"));

    // Assert
    expect(other.projectId).toBe("p2");
  });

  test("should refuse an algorithm that does not fit the usage before storing anything", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();

    // Action
    const result = service.generateKmsKey({
      ...customerKey(org, "p1"),
      keyUsage: KmsKeyUsage.SIGN_VERIFY,
      encryptionAlgorithm: SymmetricKeyAlgorithm.AES_GCM_256
    });

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
    expect(await memory.stores.kmsKeyStore.find({ orgId: org })).toHaveLength(0);
  });
});

describe("KmsKeyService.importKeyMaterial", () => {
  test("should import symmetric material and export the same bytes", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    const bytes = Buffer.alloc(32, 7);

    // Action
    const record = await service.importKeyMaterial({
      key: bytes,
      algorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      isReserved: false,
      orgId: org,
      projectId: "p1",
      name: "imported"
    });

    // Assert
    expect(await service.getKeyMaterial({ kmsId: record.id })).toEqual(bytes);
  });

  test("should refuse material of the wrong length and store nothing", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();

    // Action
    const result = service.importKeyMaterial({
      key: Buffer.alloc(5),
      algorithm: SymmetricKeyAlgorithm.AES_GCM_256,
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT,
      isReserved: false,
      orgId: org,
      projectId: "p1"
    });

    // Assert
    await expect(result).rejects.toThrow("Invalid key material length");
    expect(await memory.stores.kmsKeyStore.find({ orgId: org })).toHaveLength(0);
  });
});

describe("KmsKeyService.rotateKmsKey", () => {
  test("should bump the version and keep ciphertext from every version readable", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1"));
    const encryptV1 = await service.encryptWithKmsKey({ kmsId: key.id });
    const v1 = await encryptV1({ plainText: Buffer.from("one") });

    // Action
    const rotated = await service.rotateKmsKey(key.id);
    const encryptV2 = await service.encryptWithKmsKey({ kmsId: key.id });
    const v2 = await encryptV2({ plainText: Buffer.from("two") });

    // Assert
    expect(rotated).toEqual({ id: key.id, version: 2 });
    const decrypt = await service.decryptWithKmsKey({ kmsId: key.id });
    expect((await decrypt(v1)).toString()).toBe("one");
    expect((await decrypt(v2)).toString()).toBe("two");
  });

  test("should refuse to rotate a reserved key and keep its version", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey({ orgId: orgId(), projectId: "p1", name: "managed", isReserved: true });

    // Action
    const result = service.rotateKmsKey(key.id);

    // Assert
    await expect(result).rejects.toThrow("Reserved Infisical-managed KMS keys cannot be rotated.");
    expect((await service.findKeyById(key.id))?.version).toBe(1);
  });

  test("should refuse an unknown key", async () => {
    // Setup
    const { service } = setup();
    const kmsId = crypto.randomUUID();

    // Action
    const result = service.rotateKmsKey(kmsId);

    // Assert
    await expect(result).rejects.toThrow(`KMS with ID '${kmsId}' not found`);
  });
});

describe("KmsKeyService.updateKeyAttributes", () => {
  test("should apply every given attribute and leave the rest", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey({ ...customerKey(orgId(), "p1"), description: "before" });

    // Action
    const updated = await service.updateKeyAttributes(key.id, {
      name: "renamed",
      description: null,
      isDisabled: true,
      hasDeleteProtection: true,
      isExportable: false,
      isPublicKeyPublished: true,
      kmipMetadata: { a: 1 }
    });

    // Assert
    expect(updated).toMatchObject({
      name: "renamed",
      description: null,
      isDisabled: true,
      hasDeleteProtection: true,
      isExportable: false,
      isPublicKeyPublished: true,
      kmipMetadata: { a: 1 },
      keyUsage: KmsKeyUsage.ENCRYPT_DECRYPT
    });
  });

  test("should turn flags back off", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey({ ...customerKey(orgId(), "p1"), hasDeleteProtection: true });
    await service.updateKeyAttributes(key.id, { isDisabled: true });

    // Action
    const updated = await service.updateKeyAttributes(key.id, { isDisabled: false, hasDeleteProtection: false });

    // Assert
    expect(updated).toMatchObject({ isDisabled: false, hasDeleteProtection: false });
  });

  test("should refuse a rename to a name another key in the project holds", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    await service.generateKmsKey(customerKey(org, "p1", "taken"));
    const other = await service.generateKmsKey(customerKey(org, "p1", "other"));

    // Action
    const result = service.updateKeyAttributes(other.id, { name: "taken", isDisabled: true });

    // Assert
    await expect(result).rejects.toThrow("duplicate key value violates unique constraint");
    expect(await service.findKeyById(other.id)).toMatchObject({ name: "other", isDisabled: false });
  });

  test("should accept a rename to the key's own name", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1", "same"));

    // Action
    const updated = await service.updateKeyAttributes(key.id, { name: "same", description: "d" });

    // Assert
    expect(updated).toMatchObject({ name: "same", description: "d" });
  });

  test("should refuse an unknown key", async () => {
    // Setup
    const { service } = setup();

    // Action
    const result = service.updateKeyAttributes(crypto.randomUUID(), { name: "x" });

    // Assert
    await expect(result).rejects.toThrow(EntityNotFoundError);
  });
});

describe("KmsKeyService.deleteKey", () => {
  test("should delete an unprotected key and its versions", async () => {
    // Setup
    const { service, memory } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1"));
    await service.rotateKmsKey(key.id);

    // Action
    const deleted = await service.deleteKey(key.id);

    // Assert
    expect(deleted?.id).toBe(key.id);
    expect(await memory.stores.kmsKeyStore.findById(key.id)).toBeNull();
  });

  test("should return null for a delete-protected key and keep it", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey({ ...customerKey(orgId(), "p1"), hasDeleteProtection: true });

    // Action
    const deleted = await service.deleteKey(key.id);

    // Assert
    expect(deleted).toBeNull();
    expect(await service.findKeyById(key.id)).toBeDefined();
  });

  test("should refuse an unknown key", async () => {
    // Setup
    const { service } = setup();

    // Action
    const result = service.deleteKey(crypto.randomUUID());

    // Assert
    await expect(result).rejects.toThrow(EntityNotFoundError);
  });
});

describe("KmsKeyService.deleteKeys", () => {
  test("should delete the given keys and count them", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();
    const a = await service.generateKmsKey(customerKey(org, "p1", "a"));
    const b = await service.generateKmsKey(customerKey(org, "p1", "b"));
    const c = await service.generateKmsKey(customerKey(org, "p1", "c"));

    // Action
    const count = await service.deleteKeys([a.id, b.id]);

    // Assert
    expect(count).toBe(2);
    expect((await memory.stores.kmsKeyStore.find({ orgId: org })).map((key) => key.id)).toEqual([c.id]);
  });

  test("should do nothing for an empty list", async () => {
    // Setup
    const { service } = setup();

    // Action
    const count = await service.deleteKeys([]);

    // Assert
    expect(count).toBe(0);
  });
});

describe("KmsKeyService reads", () => {
  test("should list a project's customer keys with a page and total", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    for (const name of ["alpha", "beta", "gamma"]) {
      // eslint-disable-next-line no-await-in-loop
      await service.generateKmsKey(customerKey(org, "p1", name));
    }

    // Action
    const page = await service.listProjectKeys({ projectId: "p1", offset: 1, limit: 1 });

    // Assert
    expect(page).toMatchObject({ totalCount: 3, keys: [{ name: "beta" }] });
  });

  test("should find keys by filter on the replica and on the primary", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();
    const key = await service.generateKmsKey(customerKey(org, "p1", "findme"));
    const find = vi.spyOn(memory.stores.kmsKeyStore, "find");

    // Action
    const replica = await service.findKeys({ orgId: org, name: "findme" });
    const primary = await service.findKeys({ orgId: org, name: "findme" }, { readFrom: ReadFrom.Primary });

    // Assert
    expect(find.mock.calls.map(([, options]) => options)).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
    expect(replica.map((found) => found.id)).toEqual([key.id]);
    expect(primary.map((found) => found.id)).toEqual([key.id]);
  });

  test("should describe a key by id and refuse an unknown one", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    const key = await service.generateKmsKey(customerKey(org, "p1"));

    // Action
    const described = await service.getKmsById(key.id);
    const missing = service.getKmsById(crypto.randomUUID());

    // Assert
    expect(described).toEqual({ id: key.id, name: key.name, orgId: org, isExternal: false });
    await expect(missing).rejects.toThrow(EntityNotFoundError);
  });

  test("should return a published key only while its public key is published", async () => {
    // Setup
    const { service, memory } = setup();
    const org = orgId();
    memory.platformRows.addProject("p1", org);
    const key = await service.generateKmsKey({
      ...customerKey(org, "p1"),
      keyUsage: KmsKeyUsage.SIGN_VERIFY,
      encryptionAlgorithm: AsymmetricKeyAlgorithm.ED25519
    });
    const findPublished = vi.spyOn(memory.stores.kmsKeyStore, "findPublishedById");

    // Action
    const before = await service.findPublishedKeyById(key.id);
    await service.updateKeyAttributes(key.id, { isPublicKeyPublished: true });
    const published = await service.findPublishedKeyById(key.id);

    // Assert
    expect(findPublished).toHaveBeenCalledTimes(2);
    expect(findPublished).toHaveBeenNthCalledWith(1, key.id, { readFrom: ReadFrom.Primary });
    expect(findPublished).toHaveBeenNthCalledWith(2, key.id, { readFrom: ReadFrom.Primary });
    expect(before).toBeUndefined();
    expect(published?.id).toBe(key.id);
  });
});

describe("KmsKeyService key material export", () => {
  test("should export a customer key's material", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1"));

    // Action
    const material = await service.getKeyMaterial({ kmsId: key.id });

    // Assert
    expect(material).toHaveLength(32);
  });

  test("should refuse a key that forbids export and a reserved key", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    const locked = await service.generateKmsKey({ ...customerKey(org, "p1", "locked"), isExportable: false });
    const reserved = await service.generateKmsKey({ orgId: org, projectId: "p1", name: "managed", isReserved: true });

    // Action
    const lockedResult = service.getKeyMaterial({ kmsId: locked.id });
    const reservedResult = service.getKeyMaterial({ kmsId: reserved.id });

    // Assert
    await expect(lockedResult).rejects.toThrow("You are not allowed to export this key");
    await expect(reservedResult).rejects.toThrow("Cannot get key material for reserved key");
  });

  test("should export several keys and name the one that refuses", async () => {
    // Setup
    const { service } = setup();
    const org = orgId();
    const open = await service.generateKmsKey(customerKey(org, "p1", "open"));
    const locked = await service.generateKmsKey({ ...customerKey(org, "p1", "locked"), isExportable: false });

    // Action
    const exported = await service.getBulkKeyMaterial({ kmsIds: [open.id] });
    const refused = service.getBulkKeyMaterial({ kmsIds: [open.id, locked.id] });

    // Assert
    expect(exported).toMatchObject([{ kmsId: open.id, name: "open" }]);
    await expect(refused).rejects.toThrow(`[kmsId=${locked.id}]`);
  });
});

describe("KmsKeyService cryptography", () => {
  test("should encrypt and decrypt with an internal key", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1"));

    // Action
    const encrypt = await service.encryptWithKmsKey({ kmsId: key.id });
    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from("secret") });
    const decrypt = await service.decryptWithKmsKey({ kmsId: key.id });

    // Assert
    expect((await decrypt({ cipherTextBlob })).toString()).toBe("secret");
  });

  test("should refuse to encrypt with an unknown key", async () => {
    // Setup
    const { service } = setup();

    // Action
    const result = service.encryptWithKmsKey({ kmsId: crypto.randomUUID() });

    // Assert
    await expect(result).rejects.toThrow(EntityNotFoundError);
  });

  test("should sign, verify and publish the public key of a sign-verify key", async () => {
    // Setup
    const { service, memory } = setup();
    const key = await service.generateKmsKey({
      ...customerKey(orgId(), "p1"),
      keyUsage: KmsKeyUsage.SIGN_VERIFY,
      encryptionAlgorithm: AsymmetricKeyAlgorithm.ED25519
    });
    const data = Buffer.from("payload");
    const findById = vi.spyOn(memory.stores.kmsKeyStore, "findById");

    // Action
    const sign = await service.signWithKmsKey({ kmsId: key.id }, { readFrom: ReadFrom.Primary });
    const { signature } = await sign({ data, signingAlgorithm: SigningAlgorithm.ED25519, isDigest: false });
    const verify = await service.verifyWithKmsKey({ kmsId: key.id, signingAlgorithm: SigningAlgorithm.ED25519 });
    const valid = await verify({ data, signature, isDigest: false });
    const tampered = await verify({ data: Buffer.from("other"), signature, isDigest: false });
    const publicKey = await service.getPublicKey({ kmsId: key.id }, { readFrom: ReadFrom.Primary });

    // Assert
    expect(findById).toHaveBeenNthCalledWith(1, key.id, { readFrom: ReadFrom.Primary });
    expect(findById).toHaveBeenNthCalledWith(2, key.id, undefined);
    expect(findById).toHaveBeenNthCalledWith(3, key.id, { readFrom: ReadFrom.Primary });
    expect(valid.signatureValid).toBe(true);
    expect(tampered.signatureValid).toBe(false);
    expect(publicKey.length).toBeGreaterThan(0);
  });

  test("should refuse to sign with an encrypt-decrypt key", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey(customerKey(orgId(), "p1"));

    // Action
    const result = service
      .signWithKmsKey({ kmsId: key.id })
      .then((sign) => sign({ data: Buffer.from("x"), signingAlgorithm: SigningAlgorithm.ED25519, isDigest: false }));

    // Assert
    await expect(result).rejects.toThrow(RuleViolationError);
  });

  test("should generate and verify a MAC", async () => {
    // Setup
    const { service } = setup();
    const key = await service.generateKmsKey({
      ...customerKey(orgId(), "p1"),
      keyUsage: KmsKeyUsage.GENERATE_VERIFY_MAC,
      encryptionAlgorithm: HmacAlgorithm.HMAC_SHA_256
    });
    const data = Buffer.from("message");

    // Action
    const generate = await service.generateMac({ kmsId: key.id });
    const { mac, algorithm } = generate({ data });
    const verify = await service.verifyMac({ kmsId: key.id });

    // Assert
    expect(algorithm).toBe(HmacAlgorithm.HMAC_SHA_256);
    expect(verify({ data, mac }).macValid).toBe(true);
    expect(verify({ data: Buffer.from("changed"), mac }).macValid).toBe(false);
  });
});

describe("KmsKeyService external keys", () => {
  test("should refuse an external key without the enterprise hook", async () => {
    // Setup
    const { service, seedOrgKey, seedExternalKey } = setup({ withHook: false });
    const org = orgId();
    await seedOrgKey(org);
    const key = await seedExternalKey(org);

    // Action
    const result = service.encryptWithKmsKey({ kmsId: key.id });

    // Assert
    await expect(result).rejects.toThrow("External KMS keys require the Infisical enterprise edition.");
  });

  test("should encrypt and decrypt with an external key through the provider", async () => {
    // Setup
    const { service, hookCalls, seedOrgKey, seedExternalKey } = setup();
    const org = orgId();
    await seedOrgKey(org);
    const key = await seedExternalKey(org);

    // Action
    const encrypt = await service.encryptWithKmsKey({ kmsId: key.id });
    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from("hello") });
    const decrypt = await service.decryptWithKmsKey({ kmsId: key.id });
    const plain = await decrypt({ cipherTextBlob });

    // Assert
    expect(plain.toString()).toBe("hello");
    expect(hookCalls.encrypt).toHaveBeenCalledTimes(1);
  });
});
