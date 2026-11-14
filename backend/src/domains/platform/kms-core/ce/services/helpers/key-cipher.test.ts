import { ReadFrom, TReadOptions } from "@app/domains/lib/data-access";
import { EntityNotFoundError } from "@app/domains/lib/errors";

import { KmsKey } from "../../models/kms-key";
import { RootKey } from "../../models/root-key";
import { InMemoryKmsCoreStores } from "../../testing/in-memory-kms-core-stores";
import { TKmsKeyStore } from "../dependencies";
import { requireKey } from "./key-cipher";

// A replica that has not caught up with a key committed a moment ago.
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
