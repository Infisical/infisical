import { randomUUID } from "node:crypto";

import { Knex } from "knex";
import ms from "ms";

import { TDomainKeyStore } from "@app/domains/lib/key-store";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { setupIntegration } from "@app/domains/lib/testing/integration";
import { sealKnexTransaction } from "@app/domains/lib/transactions";
import { keyValueStoreDALFactory } from "@app/keystore/key-value-store-dal";

import { FolderGrantCache } from "./folder-grant-cache";

describe("FolderGrantCache.bumpFolderVersions", () => {
  const h = setupIntegration();

  // The folder version lives in key_value_store, through the same DAL the server's key store uses; the Redis half
  // of the key store is not used here.
  const postgresKeyStore = (): TDomainKeyStore => {
    const keyValueStore = keyValueStoreDALFactory(h.db);
    return Object.assign(new InMemoryKeyStore(), {
      pgIncrementBy: (key: string, { incr, tx, expiry }: { incr?: number; tx?: Knex; expiry?: string }) =>
        keyValueStore.incrementBy(key, {
          incr,
          tx,
          expiresAt: expiry ? new Date(Date.now() + ms(expiry as ms.StringValue)) : undefined
        }),
      pgGetIntItem: (key: string) => keyValueStore.findOneInt(key)
    });
  };

  test("should commit the bump with the caller's transaction", async () => {
    // Setup
    const cache = new FolderGrantCache(postgresKeyStore(), 0);
    const projectId = randomUUID();

    // Action
    await h.db.transaction(async (trx) => {
      await cache.bumpFolderVersions({ projectIds: [projectId, projectId], tx: sealKnexTransaction(trx) });
    });

    // Assert
    expect(await cache.getFolderVersion(projectId)).toBe(1);
  });

  test("should roll the bump back with the caller's transaction", async () => {
    // Setup
    const cache = new FolderGrantCache(postgresKeyStore(), 0);
    const projectId = randomUUID();

    // Action
    const result = h.db.transaction(async (trx) => {
      await cache.bumpFolderVersions({ projectIds: [projectId], tx: sealKnexTransaction(trx) });
      throw new Error("the folder change failed");
    });

    // Assert
    await expect(result).rejects.toThrow("the folder change failed");
    expect(await cache.getFolderVersion(projectId)).toBe(0);
  });
});
