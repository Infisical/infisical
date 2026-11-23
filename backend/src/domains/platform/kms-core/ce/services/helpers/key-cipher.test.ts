import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError } from "@app/domains/lib/errors";

import { KmsKey } from "../../models/kms-key";
import { OrganizationKey } from "../../models/organization-key";
import { RootKey } from "../../models/root-key";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { KmsDataKey, KmsDataKeyService } from "../data-key/service";
import { TExternalKmsHook, TKmsCoreStores, TKmsKeyStore, TOrganizationKeyStore } from "../dependencies";
import { KeyCipher, requireKey } from "./key-cipher";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// A replica that hasn't caught up with a just-committed key.
const laggingKeyStore = (mem: InMemoryKmsCoreStores, lagging: string) => {
  const reads: (TReadOptions | undefined)[] = [];
  const store = Object.create(mem.stores.kmsKeyStore) as TKmsKeyStore;
  store.findById = async (id: string, options?: TReadOptions) => {
    reads.push(options);
    return id === lagging && options?.readFrom !== ReadFrom.Primary
      ? null
      : mem.stores.kmsKeyStore.findById(id, options);
  };
  return { store, reads };
};

const newKey = async (mem: InMemoryKmsCoreStores) => {
  const key = KmsKey.createReserved({ orgId: "org-1", rootKey: RootKey.generate() });
  await mem.kmsKeyStore.insert(key);
  return key;
};

describe("requireKey", () => {
  test("should read a key the replica does not have yet from the primary", async () => {
    // Setup
    const mem = new InMemoryKmsCoreStores();
    const key = await newKey(mem);
    const { store, reads } = laggingKeyStore(mem, key.id);

    // Action
    const found = await requireKey(store, key.id);

    // Assert
    expect(found.id).toBe(key.id);
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should not read twice when the replica has the key", async () => {
    // Setup
    const mem = new InMemoryKmsCoreStores();
    const key = await newKey(mem);
    const { store, reads } = laggingKeyStore(mem, "another-key");

    // Action
    await requireKey(store, key.id);

    // Assert
    expect(reads).toEqual([undefined]);
  });

  test("should refuse a key that exists nowhere after one primary read", async () => {
    // Setup
    const mem = new InMemoryKmsCoreStores();
    const { store, reads } = laggingKeyStore(mem, "missing");

    // Action
    const result = requireKey(store, "missing");

    // Assert
    await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should not read again when the caller already read the primary", async () => {
    // Setup
    const mem = new InMemoryKmsCoreStores();
    const { store, reads } = laggingKeyStore(mem, "missing");

    // Action
    const result = requireKey(store, "missing", { readFrom: ReadFrom.Primary });

    // Assert
    await expect(result).rejects.toThrow("KMS with ID 'missing' not found");
    expect(reads).toEqual([{ readFrom: ReadFrom.Primary }]);
  });
});

const fakeExternalKms = (): TExternalKmsHook => ({
  assertInputsAllowed: async () => {},
  encrypt: async (_key, _orgCipher, plainText) => Buffer.from(plainText),
  decrypt: async (_key, _orgCipher, cipherTextBlob) => Buffer.from(cipherTextBlob)
});

// A replica that has the org row but not yet the data key committed on the primary.
const cipherOnLaggingOrgReplica = async ({ orgHasDataKey = true, isLagging = true } = {}) => {
  const mem = new InMemoryKmsCoreStores();
  mem.platformRows.addProject("project-1", "org-1");
  const rootKey = RootKey.generate();
  if (orgHasDataKey) {
    const service = new KmsDataKeyService(
      mem.transactionRunner,
      mem.stores,
      rootKey,
      new KeyCipher(mem.stores, rootKey, fakeExternalKms())
    );
    await service.createCipherPairWithDataKey({ type: KmsDataKey.Organization, orgId: "org-1" });
  }
  const external = KmsKey.createExternal({
    orgId: "org-1",
    name: "external",
    provider: "aws",
    encryptedProviderInputs: Buffer.from("inputs"),
    providerInputsVersion: 2
  });
  await mem.kmsKeyStore.insert(external);

  const reads: (TReadOptions | undefined)[] = [];
  const organizationKeyStore = Object.create(mem.organizationKeyStore) as TOrganizationKeyStore;
  organizationKeyStore.find = async (orgId: string, options?: TReadOptions) => {
    reads.push(options);
    return isLagging && options?.readFrom !== ReadFrom.Primary
      ? OrganizationKey.restore({ orgId, kmsKeyId: null, encryptedDataKey: null })
      : mem.stores.organizationKeyStore.find(orgId, options);
  };
  const replica: TKmsCoreStores = { ...mem.stores, organizationKeyStore };
  return { cipher: new KeyCipher(replica, rootKey, fakeExternalKms()), external, reads };
};

describe("KeyCipher with an external key", () => {
  test("should read the org data key from the primary when the replica shows the org without one", async () => {
    // Setup
    const { cipher, external, reads } = await cipherOnLaggingOrgReplica();

    // Action
    const encrypt = await cipher.encryptor(external);
    const decrypt = await cipher.decryptor(external);
    const { cipherTextBlob } = await encrypt({ plainText: Buffer.from("payload") });

    // Assert
    expect((await decrypt({ cipherTextBlob })).toString()).toBe("payload");
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }, undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should not read the org twice when the replica has its data key", async () => {
    // Setup
    const { cipher, external, reads } = await cipherOnLaggingOrgReplica({ isLagging: false });

    // Action
    await cipher.encryptor(external);

    // Assert
    expect(reads).toEqual([undefined]);
  });

  test("should refuse an org that has no data key on the primary either", async () => {
    // Setup
    const { cipher, external, reads } = await cipherOnLaggingOrgReplica({ orgHasDataKey: false });

    // Action
    const result = cipher.encryptor(external);

    // Assert
    await expect(result).rejects.toThrow("Invalid organization KMS");
    expect(reads).toEqual([undefined, { readFrom: ReadFrom.Primary }]);
  });

  test("should not read the org again when the caller already read the primary", async () => {
    // Setup
    const { cipher, external, reads } = await cipherOnLaggingOrgReplica({ orgHasDataKey: false });

    // Action
    const result = cipher.encryptor(external, { readFrom: ReadFrom.Primary });

    // Assert
    await expect(result).rejects.toThrow("Invalid organization KMS");
    expect(reads).toEqual([{ readFrom: ReadFrom.Primary }]);
  });
});
