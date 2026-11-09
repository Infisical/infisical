import { RootKeyConfig, TRootKeyConfigProps } from "../model/root-key-config";
import { InMemoryKmsCoreDataAccess } from "../testing/in-memory-kms-core-data-access";
import { RootKeyHolder } from "./root-key-holder";
import { RootKeyRotationService } from "./root-key-rotation-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const RETAINED_ID = "11111111-1111-1111-1111-111111111111";

const retainedRow = (overrides: Partial<TRootKeyConfigProps> = {}): TRootKeyConfigProps => ({
  id: RETAINED_ID,
  encryptedRootKey: Buffer.alloc(32, 1),
  encryptionStrategy: "SOFTWARE",
  kekLabel: "a".repeat(32),
  supersededAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS),
  lastResolvedAt: null,
  activatedAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  createdAt: new Date(Date.now() - (RETENTION_DAYS + 2) * DAY_MS),
  updatedAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS),
  ...overrides
});

// The cleanup reads its candidates first and re-reads each one under the root key lock. `snapshot` is what that
// first read returns; `stored` is the row the locked re-read finds, which can have changed in between.
const buildService = ({ snapshot, stored }: { snapshot?: TRootKeyConfigProps; stored: TRootKeyConfigProps }) => {
  const inMemory = new InMemoryKmsCoreDataAccess();
  inMemory.state.tables.rootKeyConfigs.set(stored.id, stored);
  if (snapshot) {
    vi.spyOn(inMemory.dataAccess.rootKeyConfigs, "findRetained").mockResolvedValue([RootKeyConfig.restore(snapshot)]);
  }
  const service = new RootKeyRotationService({
    transactionRunner: inMemory.transactionRunner,
    dataAccess: inMemory.dataAccess,
    state: { rootKey: new RootKeyHolder(), hooks: {} },
    retentionDays: RETENTION_DAYS,
    currentKekLabel: () => null,
    isFipsEnabled: () => false
  });
  return { service, isRetained: () => inMemory.state.tables.rootKeyConfigs.has(RETAINED_ID) };
};

describe("RootKeyRotationService.removeInactiveKeys", () => {
  test("should remove a retained key nothing has been seen using", async () => {
    // Setup
    const { service, isRetained } = buildService({ stored: retainedRow() });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(isRetained()).toBe(false);
  });

  // The boot stamp is written outside the root key lock, so an instance can stamp between the first read and the
  // locked delete. Deleting anyway would break that instance's next restart.
  test("should keep a retained key an instance reported using after the candidates were read", async () => {
    // Setup
    const { service, isRetained } = buildService({
      snapshot: retainedRow({ lastResolvedAt: null }),
      stored: retainedRow({ lastResolvedAt: new Date() })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(isRetained()).toBe(true);
  });

  test("should remove a key whose last reported use is older than the retention window", async () => {
    // Setup
    const { service, isRetained } = buildService({
      stored: retainedRow({ lastResolvedAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY_MS) })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(isRetained()).toBe(false);
  });

  test("should keep a key that stopped being superseded between the first read and the lock", async () => {
    // Setup
    const { service, isRetained } = buildService({
      snapshot: retainedRow(),
      stored: retainedRow({ supersededAt: null })
    });

    // Action
    await service.removeInactiveKeys();

    // Assert
    expect(isRetained()).toBe(true);
  });
});

describe("RootKeyRotationService.deleteExpiringKey", () => {
  // force overrides the straggler check only. Left overridable, an admin acting on a stale view would destroy a
  // key a second admin rotated in after that view was read, which is not recoverable.
  test("should refuse a label that is not the key currently retained, even with force", async () => {
    // Setup
    const { service, isRetained } = buildService({ stored: retainedRow({ lastResolvedAt: new Date() }) });

    // Action
    const result = service.deleteExpiringKey({ label: "b".repeat(32), force: true });

    // Assert
    await expect(result).rejects.toThrow("Another rotation has taken effect");
    expect(isRetained()).toBe(true);
  });

  test("should refuse an unlabelled key rather than remove one nothing can name", async () => {
    // Setup
    const { service, isRetained } = buildService({ stored: retainedRow({ kekLabel: null }) });

    // Action
    const result = service.deleteExpiringKey({ label: "a".repeat(32) });

    // Assert
    await expect(result).rejects.toThrow(/Restart the instance/);
    expect(isRetained()).toBe(true);
  });

  test("should ask for force while an instance recently started on the key", async () => {
    // Setup
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, isRetained } = buildService({ stored: row });

    // Action
    const result = service.deleteExpiringKey({ label: row.kekLabel as string });

    // Assert
    await expect(result).rejects.toThrow(/force=true/);
    expect(isRetained()).toBe(true);
  });

  test("should remove the key with force despite an instance recently starting on it", async () => {
    // Setup
    const row = retainedRow({ lastResolvedAt: new Date() });
    const { service, isRetained } = buildService({ stored: row });

    // Action
    await service.deleteExpiringKey({ label: row.kekLabel as string, force: true });

    // Assert
    expect(isRetained()).toBe(false);
  });
});
