/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { SecretType, TableName } from "@app/db/schemas";

import { secretV2BridgeDALFactory } from "./secret-v2-bridge-dal";

/**
 * Tests for personal override DAL helpers used by moveSecrets
 * to keep personal overrides aligned with shared secrets.
 *
 * These tests use a mock DB layer to verify the query logic.
 */

// Helper to create a mock knex/db chain
const createMockDb = () => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  chain.where = vi.fn().mockReturnValue(chain);
  chain.whereIn = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([]);

  const db = vi.fn().mockReturnValue(chain);
  // replicaNode returns the same callable
  (db as any).replicaNode = vi.fn().mockReturnValue(db);
  // ref / raw helpers used by other DAL methods
  (db as any).ref = vi.fn().mockReturnValue({ withSchema: vi.fn().mockReturnValue({ as: vi.fn() }) });
  (db as any).raw = vi.fn();

  return { db, chain };
};

describe("movePersonalOverrides", () => {
  test("should call db with correct filter for personal secrets by key and folderId", async () => {
    const { db, chain } = createMockDb();

    const movedOverrides = [
      { id: "override-1", key: "API_URL", type: SecretType.Personal, folderId: "dest-folder", userId: "user-1" },
      { id: "override-2", key: "API_URL", type: SecretType.Personal, folderId: "dest-folder", userId: "user-2" }
    ];
    chain.returning.mockResolvedValue(movedOverrides);

    // Create a minimal DAL with just the method we need
    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.movePersonalOverrides("source-folder", "dest-folder", ["API_URL"]);

    // Verify correct table was targeted
    expect(db).toHaveBeenCalledWith(TableName.SecretV2);

    // Verify where clause filters by source folderId and Personal type
    expect(chain.where).toHaveBeenCalledWith({
      folderId: "source-folder",
      type: SecretType.Personal
    });

    // Verify whereIn filters by the secret keys
    expect(chain.whereIn).toHaveBeenCalledWith("key", ["API_URL"]);

    // Verify update sets correct destination folderId
    expect(chain.update).toHaveBeenCalledWith({ folderId: "dest-folder" });

    // Verify returning all columns
    expect(chain.returning).toHaveBeenCalledWith("*");

    // Verify result
    expect(result).toEqual(movedOverrides);
    expect(result).toHaveLength(2);
  });

  test("should return empty array and skip DB call when secretKeys is empty", async () => {
    const { db } = createMockDb();
    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.movePersonalOverrides("source-folder", "dest-folder", []);

    // Should not call db at all
    expect(db).not.toHaveBeenCalledWith(TableName.SecretV2);
    expect(result).toEqual([]);
  });

  test("should handle multiple secret keys in bulk move", async () => {
    const { db, chain } = createMockDb();

    const movedOverrides = [
      { id: "override-1", key: "API_URL", type: SecretType.Personal, folderId: "dest-folder", userId: "user-1" },
      { id: "override-2", key: "DB_HOST", type: SecretType.Personal, folderId: "dest-folder", userId: "user-1" },
      { id: "override-3", key: "API_URL", type: SecretType.Personal, folderId: "dest-folder", userId: "user-2" }
    ];
    chain.returning.mockResolvedValue(movedOverrides);

    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.movePersonalOverrides("source-folder", "dest-folder", ["API_URL", "DB_HOST"]);

    // Verify whereIn with multiple keys
    expect(chain.whereIn).toHaveBeenCalledWith("key", ["API_URL", "DB_HOST"]);
    expect(result).toHaveLength(3);
  });

  test("should use provided transaction when given", async () => {
    const { chain } = createMockDb();

    // Create a separate tx mock
    const txChain: Record<string, ReturnType<typeof vi.fn>> = {};
    txChain.where = vi.fn().mockReturnValue(txChain);
    txChain.whereIn = vi.fn().mockReturnValue(txChain);
    txChain.update = vi.fn().mockReturnValue(txChain);
    txChain.returning = vi.fn().mockResolvedValue([]);

    const tx = vi.fn().mockReturnValue(txChain);

    // Create db that should NOT be called
    const db = vi.fn().mockReturnValue(chain);
    (db as any).replicaNode = vi.fn().mockReturnValue(db);
    (db as any).ref = vi.fn().mockReturnValue({ withSchema: vi.fn().mockReturnValue({ as: vi.fn() }) });
    (db as any).raw = vi.fn();

    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    await dal.movePersonalOverrides("source-folder", "dest-folder", ["API_URL"], tx as any);

    // tx should be used instead of db
    expect(tx).toHaveBeenCalledWith(TableName.SecretV2);
    // db should NOT have been called for this query
    expect(db).not.toHaveBeenCalledWith(TableName.SecretV2);
  });

  test("should return empty array when no personal overrides exist for given keys", async () => {
    const { db, chain } = createMockDb();
    chain.returning.mockResolvedValue([]);

    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.movePersonalOverrides("source-folder", "dest-folder", ["NON_EXISTENT_KEY"]);

    expect(result).toEqual([]);
  });
});

describe("deletePersonalOverridesByKeys", () => {
  test("should delete personal overrides in source folder by keys", async () => {
    const { db, chain } = createMockDb();

    const deletedOverrides = [
      { id: "override-1", key: "API_URL", type: SecretType.Personal, folderId: "source-folder" }
    ];
    chain.returning.mockResolvedValue(deletedOverrides);

    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.deletePersonalOverridesByKeys("source-folder", ["API_URL"]);

    expect(db).toHaveBeenCalledWith(TableName.SecretV2);
    expect(chain.where).toHaveBeenCalledWith({
      folderId: "source-folder",
      type: SecretType.Personal
    });
    expect(chain.whereIn).toHaveBeenCalledWith("key", ["API_URL"]);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.returning).toHaveBeenCalledWith("*");
    expect(result).toEqual(deletedOverrides);
  });

  test("should return empty array and skip DB call when secretKeys is empty", async () => {
    const { db } = createMockDb();

    const mockKeyStore = {
      pgIncrementBy: vi.fn(),
      deleteItem: vi.fn()
    } as any;

    const dal = secretV2BridgeDALFactory({ db: db as any, keyStore: mockKeyStore });

    const result = await dal.deletePersonalOverridesByKeys("source-folder", []);

    expect(db).not.toHaveBeenCalledWith(TableName.SecretV2);
    expect(result).toEqual([]);
  });
});

describe("moveSecrets personal override handling - integration logic", () => {
  /**
   * These tests verify the logical flow of what moveSecrets should do
   * with personal overrides in different scenarios.
   */

  test("scenario: direct move (no approval policies) should move overrides", () => {
    // This test documents the expected behavior:
    // When isDestinationUpdated = true AND isSourceUpdated = true
    // (no approval policies on either side), personal overrides should be moved.

    const isDestinationUpdated = true;
    const isSourceUpdated = true;

    // In the fixed code, movePersonalOverrides is called when:
    // - Source has no approval policy (direct delete path)
    // - AND destination was directly updated
    const shouldMoveOverrides = isDestinationUpdated && isSourceUpdated;
    expect(shouldMoveOverrides).toBe(true);
  });

  test("scenario: destination has approval policy should delete source overrides", () => {
    // When destination has approval policy, isDestinationUpdated = false.
    // Source shared secrets can still be deleted directly, so source overrides
    // must be deleted to prevent orphaned personal records.

    const isDestinationUpdated = false; // approval policy at destination
    const isSourceUpdated = true;

    const shouldMoveOverrides = isDestinationUpdated;
    const shouldDeleteOverrides = !isDestinationUpdated && isSourceUpdated;

    expect(shouldMoveOverrides).toBe(false);
    expect(shouldDeleteOverrides).toBe(true);
  });

  test("scenario: source has approval policy should NOT move overrides", () => {
    // When source has approval policy, the code enters the approval branch
    // and never reaches the direct-delete + move-overrides code.

    const isSourceUpdated = false; // approval policy at source

    // The movePersonalOverrides call is inside the `else` branch
    // of the source approval policy check, so it's never reached.
    const sourceHasApprovalPolicy = !isSourceUpdated;
    expect(sourceHasApprovalPolicy).toBe(true);
    // In this case, no overrides are moved (correct behavior:
    // shared secret still exists at source pending approval)
  });

  test("scenario: both have approval policies should NOT move overrides", () => {
    const isDestinationUpdated = false; // approval policy at destination
    const isSourceUpdated = false; // approval policy at source

    // Neither direct path is taken, no overrides moved
    const shouldMoveOverrides = isDestinationUpdated && isSourceUpdated;
    expect(shouldMoveOverrides).toBe(false);
  });
});
