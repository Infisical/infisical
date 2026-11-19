import { describe, expect, it, vi } from "vitest";
import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

import { secretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

describe("invalidateSecretCacheByProjectId", () => {
  const createMockDb = (grants: Record<string, { targetProjectId: string }[]>) => {
    const queryBuilder = (tableName: string) => {
      let sourceProjectId: string | undefined;

      const chain = {
        where: vi.fn((column: string, value: string) => {
          if (column === "sourceProjectId") {
            sourceProjectId = value;
          }
          return chain;
        }),
        select: vi.fn(() => chain),
        groupBy: vi.fn(async () => {
          if (tableName === TableName.ProjectFolderGrant && sourceProjectId) {
            return grants[sourceProjectId] || [];
          }
          return [];
        })
      };

      return chain;
    };

    const db = Object.assign(vi.fn(queryBuilder), {
      replicaNode: vi.fn(() => vi.fn(queryBuilder))
    });

    return db as unknown as TDbClient;
  };

  const createMockKeyStore = () => {
    const pgIncrementByCalls: { key: string; tx?: Knex }[] = [];
    const deleteItemCalls: string[] = [];

    const keyStore = {
      pgIncrementBy: vi.fn(async (key: string, options: { incr?: number; tx?: Knex }) => {
        pgIncrementByCalls.push({ key, tx: options.tx });
        return 1;
      }),
      deleteItem: vi.fn(async (key: string) => {
        deleteItemCalls.push(key);
        return 1;
      })
    } as unknown as TKeyStoreFactory;

    return { keyStore, pgIncrementByCalls, deleteItemCalls };
  };

  it("invalidates cache-version rows in deterministic sorted order to prevent deadlocks", async () => {
    const grants = {
      "project-B": [{ targetProjectId: "project-A" }, { targetProjectId: "project-C" }]
    };
    const db = createMockDb(grants);
    const { keyStore, pgIncrementByCalls, deleteItemCalls } = createMockKeyStore();
    const mockTx = Object.assign(vi.fn(db), { isTransaction: true }) as unknown as Knex;

    const dal = secretV2BridgeDALFactory({ db, keyStore });

    await dal.invalidateSecretCacheByProjectId("project-B", mockTx);

    // Verify all keys were incremented with tx in deterministic sorted order
    expect(pgIncrementByCalls).toEqual([
      { key: KeyStorePrefixes.SecretDalVersion("project-A"), tx: mockTx },
      { key: KeyStorePrefixes.SecretDalVersion("project-B"), tx: mockTx },
      { key: KeyStorePrefixes.SecretDalVersion("project-C"), tx: mockTx }
    ]);
    expect(deleteItemCalls.sort()).toEqual([
      expect.stringContaining("project-A"),
      expect.stringContaining("project-B"),
      expect.stringContaining("project-C")
    ]);
  });

  it("enforces identical lock ordering for reciprocal cross-project grants", async () => {
    const grants = {
      "project-A": [{ targetProjectId: "project-B" }],
      "project-B": [{ targetProjectId: "project-A" }]
    };
    const db = createMockDb(grants);

    // Transaction 1 updating project-A
    const keyStore1 = createMockKeyStore();
    const tx1 = Object.assign(vi.fn(db), { id: "tx-1" }) as unknown as Knex;
    const dal1 = secretV2BridgeDALFactory({ db, keyStore: keyStore1.keyStore });
    await dal1.invalidateSecretCacheByProjectId("project-A", tx1);

    // Transaction 2 updating project-B
    const keyStore2 = createMockKeyStore();
    const tx2 = Object.assign(vi.fn(db), { id: "tx-2" }) as unknown as Knex;
    const dal2 = secretV2BridgeDALFactory({ db, keyStore: keyStore2.keyStore });
    await dal2.invalidateSecretCacheByProjectId("project-B", tx2);

    // Both transactions must acquire locks in the exact same sorted order (project-A then project-B)
    expect(keyStore1.pgIncrementByCalls.map((c) => c.key)).toEqual([
      KeyStorePrefixes.SecretDalVersion("project-A"),
      KeyStorePrefixes.SecretDalVersion("project-B")
    ]);
    expect(keyStore2.pgIncrementByCalls.map((c) => c.key)).toEqual([
      KeyStorePrefixes.SecretDalVersion("project-A"),
      KeyStorePrefixes.SecretDalVersion("project-B")
    ]);
  });

  it("deduplicates project IDs if target grants include self or duplicate entries", async () => {
    const grants = {
      "project-A": [
        { targetProjectId: "project-B" },
        { targetProjectId: "project-A" },
        { targetProjectId: "project-B" }
      ]
    };
    const db = createMockDb(grants);
    const { keyStore, pgIncrementByCalls } = createMockKeyStore();

    const dal = secretV2BridgeDALFactory({ db, keyStore });
    await dal.invalidateSecretCacheByProjectId("project-A");

    expect(pgIncrementByCalls.map((c) => c.key)).toEqual([
      KeyStorePrefixes.SecretDalVersion("project-A"),
      KeyStorePrefixes.SecretDalVersion("project-B")
    ]);
  });

  it("cleans up ETags for successfully updated projects even if a subsequent version increment fails", async () => {
    const grants = {
      "project-A": [{ targetProjectId: "project-B" }]
    };
    const db = createMockDb(grants);
    const { keyStore, deleteItemCalls } = createMockKeyStore();

    vi.mocked(keyStore.pgIncrementBy).mockImplementation(async (key: string) => {
      if (key === KeyStorePrefixes.SecretDalVersion("project-B")) {
        throw new Error("Target project connection error");
      }
      return 1;
    });

    const dal = secretV2BridgeDALFactory({ db, keyStore });
    await expect(dal.invalidateSecretCacheByProjectId("project-A")).rejects.toThrow(
      "Target project connection error"
    );

    expect(deleteItemCalls).toEqual([expect.stringContaining("project-A")]);
  });

  it("invalidates source project cache even if grant lookup fails without tx", async () => {
    const db = {
      replicaNode: () => () => ({
        where: () => ({
          select: () => ({
            groupBy: async () => {
              throw new Error("Read replica timeout");
            }
          })
        })
      })
    } as unknown as Knex;
    const { keyStore, pgIncrementByCalls, deleteItemCalls } = createMockKeyStore();

    const dal = secretV2BridgeDALFactory({ db, keyStore });
    await expect(dal.invalidateSecretCacheByProjectId("project-A")).rejects.toThrow("Read replica timeout");

    expect(pgIncrementByCalls.map((c) => c.key)).toEqual([
      KeyStorePrefixes.SecretDalVersion("project-A")
    ]);
    expect(deleteItemCalls).toEqual([expect.stringContaining("project-A")]);
  });
});
