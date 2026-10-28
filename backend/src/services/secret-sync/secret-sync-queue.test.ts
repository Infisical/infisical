import { beforeEach, describe, expect, test, vi } from "vitest";

import { recordSecretSyncOutcomeMetric, recordSecretSyncStatusChangeMetric } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName } from "@app/queue";

import { SecretSync, SecretSyncInitialSyncBehavior } from "./secret-sync-enums";
import { SecretSyncError } from "./secret-sync-errors";
import { SecretSyncFns } from "./secret-sync-fns";
import { secretSyncQueueFactory } from "./secret-sync-queue";

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => ({ OTEL_TELEMETRY_COLLECTION_ENABLED: false, isSmtpConfigured: false })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/telemetry/metrics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/telemetry/metrics")>()),
  recordSecretSyncOutcomeMetric: vi.fn(),
  recordSecretSyncStatusChangeMetric: vi.fn()
}));

vi.mock("@app/services/app-connection/app-connection-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/app-connection/app-connection-fns")>()),
  decryptAppConnectionCredentials: vi.fn(async () => ({}))
}));

vi.mock("@app/services/secret-sync/secret-sync-recursive-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/services/secret-sync/secret-sync-recursive-fns")>()),
  buildSyncPayload: vi.fn(async () => ({}))
}));

vi.mock("@app/services/secret-sync/secret-sync-fns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/services/secret-sync/secret-sync-fns")>();
  return {
    ...actual,
    enterpriseSyncCheck: vi.fn(async () => undefined),
    SecretSyncFns: { ...actual.SecretSyncFns, syncSecrets: vi.fn() }
  };
});

const ATTEMPTS = 5;
// Matches REQUEUE_LIMIT in the queue: at this count a lock failure stops requeueing and fails the sync.
const REQUEUE_LIMIT = 120;
const LAST_SYNCED_AT = new Date("2026-10-01T00:00:00.000Z");

type TSyncState = { lastSyncedAt: Date | null; lastSyncMessage: string | null; lastSyncResult: string | null };
type THandler = (job: unknown) => Promise<void>;

// staleLoad: every attempt loads the sync as it was before the test, standing in for a job that read the row
// before another job for the same sync finished.
const createHarness = (initial: TSyncState, { lockFails = false, staleLoad = false } = {}) => {
  const handlers = new Map<string, THandler>();
  const queueService = {
    start: vi.fn((name: string, fn: THandler) => {
      handlers.set(name, fn);
    }),
    queue: vi.fn(async () => undefined)
  };

  const state = {
    id: "sync-1",
    name: "sync",
    destination: SecretSync.Railway,
    projectId: "project-1",
    folderId: "folder-1",
    connectionId: "connection-1",
    connection: { orgId: "org-1", encryptedCredentials: Buffer.from(""), projectId: "project-1" },
    environment: { slug: "dev", name: "Development" },
    folder: { path: "/" },
    syncOptions: { initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination },
    destinationConfig: {},
    ...initial
  };
  const snapshot = { ...state };
  const secretSyncDAL = {
    findConnectionId: vi.fn(async () => state.connectionId),
    // Every attempt reloads the sync, as the real handler does.
    findById: vi.fn(async () => (staleLoad ? { ...snapshot } : { ...state })),
    // A conditional UPDATE: only a row still matching the filter is changed and returned.
    update: vi.fn(async (filter: Partial<typeof state>, data: Partial<typeof state>) => {
      const matches = Object.entries(filter).every(([key, value]) => state[key as keyof typeof state] === value);
      return matches ? [Object.assign(state, data)] : [];
    }),
    updateById: vi.fn(async (_id: string, data: Partial<typeof state>) => {
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) Object.assign(state, { [key]: value });
      });
      return { ...state };
    })
  };

  secretSyncQueueFactory({
    queueService,
    secretSyncDAL,
    keyStore: {
      acquireLock: vi.fn(async () => {
        if (lockFails) throw new Error("locked");
        return { release: vi.fn(async () => undefined) };
      }),
      incrementByAndRefreshExpiryIfUnderLimit: vi.fn(async () => 1),
      decrementByOrDelete: vi.fn(async () => 0)
    },
    kmsService: { createCipherPairWithDataKey: vi.fn(async () => ({ decryptor: () => Buffer.from("") })) },
    auditLogService: { createAuditLog: vi.fn(async () => undefined) },
    telemetryService: { sendPostHogEvents: vi.fn(async () => undefined) },
    licenseService: { getPlan: vi.fn() }
  } as never);

  const runSync = (attempt: number, data: Record<string, unknown> = {}) =>
    handlers.get(QueueName.AppConnectionSecretSync)!({
      name: QueueJobs.SecretSyncSyncSecrets,
      id: `job-${attempt}`,
      data: { syncId: "sync-1", ...data },
      attemptsStarted: attempt,
      opts: { attempts: ATTEMPTS }
    });

  return { state, runSync, secretSyncDAL };
};

const syncSecrets = vi.mocked(SecretSyncFns.syncSecrets);
const statusChangeCalls = () => vi.mocked(recordSecretSyncStatusChangeMetric).mock.calls.map(([params]) => params);

const healthy: TSyncState = { lastSyncedAt: LAST_SYNCED_AT, lastSyncMessage: null, lastSyncResult: "succeeded" };
const failed: TSyncState = {
  lastSyncedAt: LAST_SYNCED_AT,
  lastSyncMessage: "Railway disabled updates",
  lastSyncResult: "failed"
};
const neverSucceeded: TSyncState = { lastSyncedAt: null, lastSyncMessage: "Invalid token", lastSyncResult: "failed" };
const brandNew: TSyncState = { lastSyncedAt: null, lastSyncMessage: null, lastSyncResult: null };

describe("secret sync status change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("flips to failed when a previously healthy sync fails its final attempt", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync } = createHarness(healthy);

    await expect(runSync(ATTEMPTS)).rejects.toThrow("upstream 500");

    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);
  });

  test("uses the result before the job, not the Running status, across retries", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync } = createHarness(healthy);

    for (let attempt = 1; attempt < ATTEMPTS; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(runSync(attempt)).rejects.toThrow();
    }
    expect(statusChangeCalls()).toEqual([]);
    expect(vi.mocked(recordSecretSyncOutcomeMetric)).toHaveBeenCalledTimes(ATTEMPTS - 1);

    await expect(runSync(ATTEMPTS)).rejects.toThrow();
    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);
  });

  test("flips to failed when a non-retryable error ends a healthy sync early", async () => {
    syncSecrets.mockRejectedValue(new SecretSyncError({ message: "Forbidden", shouldRetry: false }));
    const { runSync } = createHarness(healthy);

    await runSync(1);

    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);
  });

  test("does not count a sync that has never succeeded", async () => {
    syncSecrets.mockRejectedValue(new Error("invalid token"));

    await expect(createHarness(neverSucceeded).runSync(ATTEMPTS)).rejects.toThrow();
    await expect(createHarness(brandNew).runSync(ATTEMPTS)).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([]);
  });

  test("does not flip again when an already failing sync fails", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync } = createHarness(failed);

    await expect(runSync(ATTEMPTS)).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([]);
  });

  test("flips to healthy when a failing sync succeeds, and only once", async () => {
    syncSecrets.mockResolvedValue({} as never);
    const { runSync } = createHarness(failed);

    await runSync(1);
    await runSync(1);

    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "healthy" }]);
  });

  test("does not flip to healthy when a healthy sync succeeds", async () => {
    syncSecrets.mockResolvedValue({} as never);

    await createHarness(healthy).runSync(1);
    await createHarness(brandNew).runSync(1);

    expect(statusChangeCalls()).toEqual([]);
  });

  test("records no status change on lock contention, and does not let it mask a later breakage", async () => {
    const contended = createHarness(healthy, { lockFails: true });

    await contended.runSync(1, { failedToAcquireLockCount: REQUEUE_LIMIT });

    expect(vi.mocked(recordSecretSyncOutcomeMetric)).toHaveBeenCalledWith({
      destination: SecretSync.Railway,
      operation: "sync",
      outcome: "failure",
      attemptsExhausted: true
    });
    expect(statusChangeCalls()).toEqual([]);

    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const afterContention = createHarness({
      lastSyncedAt: contended.state.lastSyncedAt,
      lastSyncMessage: contended.state.lastSyncMessage,
      lastSyncResult: contended.state.lastSyncResult
    });
    await expect(afterContention.runSync(ATTEMPTS)).rejects.toThrow();

    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);
  });

  test("keeps a provider failure through later lock contention, so its recovery is still counted", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const broken = createHarness(healthy);
    await expect(broken.runSync(ATTEMPTS)).rejects.toThrow();

    const contended = createHarness(
      { lastSyncedAt: broken.state.lastSyncedAt, lastSyncMessage: null, lastSyncResult: broken.state.lastSyncResult },
      { lockFails: true }
    );
    await contended.runSync(1, { failedToAcquireLockCount: REQUEUE_LIMIT });
    expect(contended.state.lastSyncResult).toBe("failed");

    syncSecrets.mockResolvedValue({} as never);
    const recovered = createHarness({
      lastSyncedAt: contended.state.lastSyncedAt,
      lastSyncMessage: contended.state.lastSyncMessage,
      lastSyncResult: contended.state.lastSyncResult
    });
    await recovered.runSync(1);

    expect(statusChangeCalls()).toEqual([
      { destination: SecretSync.Railway, newStatus: "failed" },
      { destination: SecretSync.Railway, newStatus: "healthy" }
    ]);
  });

  test("counts the change once the result commits, even if the rest of the finished-run write fails", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync, state, secretSyncDAL } = createHarness(healthy);
    const writeRun = secretSyncDAL.updateById.getMockImplementation()!;
    secretSyncDAL.updateById.mockImplementation(async (id, data) => {
      if (data.lastSyncResult !== undefined) throw new Error("connection reset");
      return writeRun(id, data);
    });

    await expect(runSync(ATTEMPTS)).rejects.toThrow();
    expect(state.lastSyncResult).toBe("failed");
    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);

    secretSyncDAL.updateById.mockImplementation(writeRun);
    await expect(runSync(ATTEMPTS)).rejects.toThrow();
    expect(statusChangeCalls()).toHaveLength(1);
  });

  test("reports a breakage once when two jobs loaded the same healthy sync", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync, state } = createHarness(healthy, { staleLoad: true });

    await expect(runSync(ATTEMPTS)).rejects.toThrow();
    await expect(runSync(ATTEMPTS)).rejects.toThrow();

    expect(state.lastSyncResult).toBe("failed");
    expect(statusChangeCalls()).toEqual([{ destination: SecretSync.Railway, newStatus: "failed" }]);
  });
});
