import { beforeAll, describe, expect, it, vi } from "vitest";

import { ConflictError } from "@app/lib/errors";
import { initLogger } from "@app/lib/logger";

import { encryptionKeyRotationServiceFactory } from "./encryption-key-rotation-service";

const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const retainedRow = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  kekLabel: "a".repeat(32),
  supersededAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS),
  lastResolvedAt: null,
  activatedAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  createdAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  ...overrides
});

// `findById` is what the GC re-reads under the lock, so it is the seam the race lives in: the snapshot
// `findRetained` returned can be stale by the time the transaction opens.
const buildService = (snapshot: ReturnType<typeof retainedRow>, underLock: unknown) => {
  const deleteById = vi.fn().mockResolvedValue({ id: snapshot.id });
  const kmsRootConfigDAL = {
    findRetained: vi.fn().mockResolvedValue([snapshot]),
    findStaged: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(underLock),
    deleteById,
    findAll: vi.fn(),
    create: vi.fn(),
    deleteAllStaged: vi.fn(),
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ raw: vi.fn().mockResolvedValue(undefined) })
      )
  };
  const kmsKekHistoryDAL = {
    findHistoryPage: vi.fn().mockResolvedValue([]),
    findActiveByLabel: vi.fn().mockResolvedValue(undefined),
    findCurrent: vi.fn(),
    updateById: vi.fn(),
    countDocuments: vi.fn().mockResolvedValue(0)
  };
  const service = encryptionKeyRotationServiceFactory({
    kmsService: { encryptRootKeyForKek: vi.fn(), getCurrentKekLabel: vi.fn() },
    kmsRootConfigDAL: kmsRootConfigDAL as never,
    kmsKekHistoryDAL: kmsKekHistoryDAL as never,
    envConfig: { KMS_ROOT_KEY_RETENTION_DAYS: RETENTION_DAYS },
    cronJob: { register: vi.fn() } as never
  });
  return { service, deleteById };
};

describe("encryption key rotation garbage collection", () => {
  beforeAll(() => {
    initLogger();
  });

  it("removes a retained key nothing has been seen using", async () => {
    const row = retainedRow();
    const { service, deleteById } = buildService(row, row);

    await service.removeInactiveKeys();

    expect(deleteById).toHaveBeenCalledWith(row.id, expect.anything());
  });

  it("keeps a retained key a straggler reported using after the snapshot was taken", async () => {
    // The boot stamp is written outside KmsRootKeyInit, so a pod can stamp between findRetained() and
    // the locked delete. Deleting anyway would break that pod's next restart.
    const snapshot = retainedRow({ lastResolvedAt: null });
    const { service, deleteById } = buildService(snapshot, retainedRow({ lastResolvedAt: new Date() }));

    await service.removeInactiveKeys();

    expect(deleteById).not.toHaveBeenCalled();
  });

  it("still removes a key whose last reported use is older than the retention window", async () => {
    const stale = new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS);
    const row = retainedRow({ lastResolvedAt: stale });
    const { service, deleteById } = buildService(row, row);

    await service.removeInactiveKeys();

    expect(deleteById).toHaveBeenCalledWith(row.id, expect.anything());
  });

  it("leaves a key that stopped being superseded between the snapshot and the lock", async () => {
    const snapshot = retainedRow();
    const { service, deleteById } = buildService(snapshot, retainedRow({ supersededAt: null }));

    await service.removeInactiveKeys();

    expect(deleteById).not.toHaveBeenCalled();
  });
});

describe("removing the expiring encryption key", () => {
  beforeAll(() => {
    initLogger();
  });

  it("refuses a label that is not the key currently held, even with force", async () => {
    // force overrides the straggler check only. Left overridable, an admin acting on a stale view would
    // destroy a key a second admin rotated in after that view was read, which is not recoverable.
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, deleteById } = buildService(row, row);

    await expect(service.deleteExpiringKey({ label: "b".repeat(32), force: true })).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(deleteById).not.toHaveBeenCalled();
  });

  it("refuses an unlabelled key rather than removing one nothing can name", async () => {
    // Only reachable if the boot backfill's label write failed. Removing it is irreversible and the
    // caller cannot have confirmed which key it is, so the refusal points at the restart that fixes it.
    const row = retainedRow({ kekLabel: null });
    const { service, deleteById } = buildService(row, row);

    await expect(service.deleteExpiringKey({ label: "a".repeat(32) })).rejects.toThrow(/Restart the instance/);
    expect(deleteById).not.toHaveBeenCalled();
  });

  it("asks for force while there is fresh evidence of a straggler", async () => {
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, deleteById } = buildService(row, row);

    await expect(service.deleteExpiringKey({ label: row.kekLabel })).rejects.toThrow(/force=true/);
    expect(deleteById).not.toHaveBeenCalled();
  });

  it("removes the key with force despite fresh evidence of a straggler", async () => {
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, deleteById } = buildService(row, row);

    await service.deleteExpiringKey({ label: row.kekLabel, force: true });

    expect(deleteById).toHaveBeenCalledWith(row.id, expect.anything());
  });
});
