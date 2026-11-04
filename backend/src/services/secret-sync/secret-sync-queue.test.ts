import { beforeEach, describe, expect, test, vi } from "vitest";

import { logger } from "@app/lib/logger";
import {
  recordSecretSyncConnectionStatusChangeMetric,
  recordSecretSyncOutcomeMetric
} from "@app/lib/telemetry/metrics";
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
  recordSecretSyncConnectionStatusChangeMetric: vi.fn()
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

type TConnectionState = { syncFailing: boolean | null };
type THandler = (job: unknown) => Promise<void>;

// connection: the app connection row the sync runs on. Pass one object to several harnesses to share it between syncs.
// staleLoad: every attempt loads the connection as it was when the harness was created, standing in for a job that
// read it before another job on the same connection finished.
const createHarness = (
  connection: TConnectionState = { syncFailing: false },
  { lockFails = false, staleLoad = false } = {}
) => {
  const handlers = new Map<string, THandler>();
  const queueService = {
    start: vi.fn((name: string, fn: THandler) => {
      handlers.set(name, fn);
    }),
    queue: vi.fn(async () => undefined)
  };

  const state: Record<string, unknown> = {
    id: "sync-1",
    name: "sync",
    destination: SecretSync.Railway,
    projectId: "project-1",
    folderId: "folder-1",
    connectionId: "connection-1",
    environment: { slug: "dev", name: "Development" },
    folder: { path: "/" },
    syncOptions: { initialSyncBehavior: SecretSyncInitialSyncBehavior.OverwriteDestination },
    destinationConfig: {},
    lastSyncedAt: new Date("2026-10-01T00:00:00.000Z"),
    lastSyncMessage: null
  };
  const loadedAtStart = { ...connection };
  const connectionRow = () => ({
    orgId: "org-1",
    encryptedCredentials: Buffer.from(""),
    projectId: "project-1",
    ...(staleLoad ? loadedAtStart : connection)
  });

  const secretSyncDAL = {
    findConnectionId: vi.fn(async () => state.connectionId),
    // Every attempt reloads the sync and its connection, as the real handler does.
    findById: vi.fn(async () => ({ ...state, connection: connectionRow() })),
    updateById: vi.fn(async (_id: string, data: Record<string, unknown>) => {
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined) state[key] = value;
      });
      return { ...state, connection: connectionRow() };
    })
  };

  // Conditional writes, as in the database: a transition only changes a value that still holds `from`.
  type TColumn = keyof TConnectionState;
  const appConnectionHealthDAL = {
    transition: vi.fn(
      async ({
        connectionId,
        column,
        from,
        to
      }: {
        connectionId: string;
        column: TColumn;
        from: boolean;
        to: boolean;
      }) => {
        if (connectionId !== state.connectionId || connection[column] !== from) return false;
        Object.assign(connection, { [column]: to });
        return true;
      }
    ),
    markWorkingIfUnknown: vi.fn(async ({ connectionId, column }: { connectionId: string; column: TColumn }) => {
      if (connectionId === state.connectionId && connection[column] === null)
        Object.assign(connection, { [column]: false });
    })
  };
  const healthWrites = () =>
    appConnectionHealthDAL.transition.mock.calls.length + appConnectionHealthDAL.markWorkingIfUnknown.mock.calls.length;

  secretSyncQueueFactory({
    queueService,
    secretSyncDAL,
    appConnectionHealthDAL,
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

  return { state, connection, runSync, secretSyncDAL, appConnectionHealthDAL, healthWrites };
};

const syncSecrets = vi.mocked(SecretSyncFns.syncSecrets);
const connectionChangeCalls = () =>
  vi.mocked(recordSecretSyncConnectionStatusChangeMetric).mock.calls.map(([params]) => params);
const outcomeCalls = () => vi.mocked(recordSecretSyncOutcomeMetric).mock.calls.map(([params]) => params);

const failedChange = { destination: SecretSync.Railway, newStatus: "failed" };
const healthyChange = { destination: SecretSync.Railway, newStatus: "healthy" };

const configError = () =>
  new SecretSyncError({ message: "GitHub does not accept secret names", shouldRetry: false, isConfigError: true });
const providerRejection = () => new SecretSyncError({ message: "Project not found.", shouldRetry: false });

describe("secret sync connection status change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("flips a healthy connection to failed when a sync fails its final attempt", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync, connection } = createHarness();

    await expect(runSync(ATTEMPTS)).rejects.toThrow("upstream 500");

    expect(connection.syncFailing).toBe(true);
    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("leaves the connection alone on intermediate retries and flips it once on the last", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync, healthWrites } = createHarness();

    for (let attempt = 1; attempt < ATTEMPTS; attempt += 1) {
      // eslint-disable-next-line no-await-in-loop
      await expect(runSync(attempt)).rejects.toThrow();
    }
    expect(healthWrites()).toBe(0);
    expect(vi.mocked(recordSecretSyncOutcomeMetric)).toHaveBeenCalledTimes(ATTEMPTS - 1);

    await expect(runSync(ATTEMPTS)).rejects.toThrow();
    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("labels a non-retryable provider error as other and flips the connection on the first attempt", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const { runSync, connection } = createHarness();

    await runSync(1);

    expect(outcomeCalls()).toEqual([
      expect.objectContaining({ outcome: "failure", attemptsExhausted: true, errorCategory: "other" })
    ]);
    expect(connection.syncFailing).toBe(true);
    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("labels a config error and leaves the connection alone", async () => {
    syncSecrets.mockRejectedValue(configError());
    const { runSync, connection, healthWrites } = createHarness();

    await runSync(1);

    expect(outcomeCalls()).toEqual([
      expect.objectContaining({ outcome: "failure", attemptsExhausted: true, errorCategory: "config" })
    ]);
    expect(connection.syncFailing).toBe(false);
    expect(healthWrites()).toBe(0);
    expect(connectionChangeCalls()).toEqual([]);
  });

  test("treats a config error that a destination wrapped as a config error", async () => {
    syncSecrets.mockRejectedValue(new SecretSyncError({ error: configError(), shouldRetry: false }));
    const { runSync, connection } = createHarness();

    await runSync(1);

    expect(outcomeCalls()).toEqual([expect.objectContaining({ errorCategory: "config" })]);
    expect(connection.syncFailing).toBe(false);
  });

  test("does not count a failure on a connection that has never worked", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const { runSync, connection } = createHarness({ syncFailing: null });

    await runSync(1);

    expect(connection.syncFailing).toBeNull();
    expect(connectionChangeCalls()).toEqual([]);
  });

  test("marks a connection that has never worked healthy on its first success, without counting it", async () => {
    syncSecrets.mockResolvedValue({} as never);
    const { runSync, connection } = createHarness({ syncFailing: null });

    await runSync(1);

    expect(connection.syncFailing).toBe(false);
    expect(connectionChangeCalls()).toEqual([]);
  });

  test("skips the write when an already failing connection fails again", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const { runSync, healthWrites } = createHarness({ syncFailing: true });

    await runSync(1);

    expect(healthWrites()).toBe(0);
    expect(connectionChangeCalls()).toEqual([]);
  });

  test("skips the write when a sync on a healthy connection succeeds", async () => {
    syncSecrets.mockResolvedValue({} as never);
    const { runSync, healthWrites } = createHarness();

    await runSync(1);

    expect(healthWrites()).toBe(0);
  });

  test("records one recovery when syncs on a failing connection succeed", async () => {
    syncSecrets.mockResolvedValue({} as never);
    const connection: TConnectionState = { syncFailing: true };

    await createHarness(connection).runSync(1);
    await createHarness(connection).runSync(1);

    expect(connection.syncFailing).toBe(false);
    expect(connectionChangeCalls()).toEqual([healthyChange]);
  });

  test("records one breakage when several syncs on one connection fail", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const connection: TConnectionState = { syncFailing: false };

    await createHarness(connection).runSync(1);
    await createHarness(connection).runSync(1);

    expect(connection.syncFailing).toBe(true);
    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("records one breakage when two syncs loaded the connection as healthy", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const connection: TConnectionState = { syncFailing: false };
    const first = createHarness(connection, { staleLoad: true });
    const second = createHarness(connection, { staleLoad: true });

    await first.runSync(1);
    await second.runSync(1);

    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("counts a recovery even when the sync loaded the connection before it started failing", async () => {
    syncSecrets.mockResolvedValue({} as never);
    const connection: TConnectionState = { syncFailing: null };
    const stale = createHarness(connection, { staleLoad: true });
    connection.syncFailing = true;

    await stale.runSync(1);

    expect(connection.syncFailing).toBe(false);
    expect(connectionChangeCalls()).toEqual([healthyChange]);
  });

  test("records lock contention as a failure without touching the connection", async () => {
    const { runSync, connection, healthWrites } = createHarness({ syncFailing: false }, { lockFails: true });

    await runSync(1, { failedToAcquireLockCount: REQUEUE_LIMIT });

    expect(outcomeCalls()).toEqual([
      {
        destination: SecretSync.Railway,
        operation: "sync",
        outcome: "failure",
        attemptsExhausted: true,
        errorCategory: "other"
      }
    ]);
    expect(healthWrites()).toBe(0);
    expect(connection.syncFailing).toBe(false);
  });

  test("records the breakage even if the rest of the finished-run write fails", async () => {
    syncSecrets.mockRejectedValue(new Error("upstream 500"));
    const { runSync, connection, secretSyncDAL } = createHarness();
    const writeRun = secretSyncDAL.updateById.getMockImplementation()!;
    secretSyncDAL.updateById.mockImplementation(async (id, data) => {
      if (data.lastSyncJobId !== undefined) throw new Error("connection reset");
      return writeRun(id, data);
    });

    await expect(runSync(ATTEMPTS)).rejects.toThrow();

    expect(connection.syncFailing).toBe(true);
    expect(connectionChangeCalls()).toEqual([failedChange]);
  });

  test("logs and still finishes the sync when the connection write fails", async () => {
    syncSecrets.mockRejectedValue(providerRejection());
    const { runSync, state, appConnectionHealthDAL } = createHarness();
    appConnectionHealthDAL.transition.mockRejectedValue(new Error("connection reset"));

    await runSync(1);

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.any(Error),
      expect.stringContaining("Failed to record app connection health")
    );
    expect(state.syncStatus).toBe("failed");
    expect(state.lastSyncJobId).toBe("job-1");
    expect(connectionChangeCalls()).toEqual([]);
  });
});
