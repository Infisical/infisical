import { beforeEach, describe, expect, test, vi } from "vitest";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { auditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";
import {
  AuditLogStreamOutboxStatus,
  TAuditLogStreamOutboxRow,
  TFailedStreamRow
} from "./audit-log-stream-outbox-types";

const STREAM_ID = "stream-1";
const ORG_ID = "org-1";
const PROVIDER = LogProvider.Datadog;

const FAILURE_MESSAGE = "upstream failure";

const batchStreamLog = vi.fn<(input: unknown) => Promise<void>>();
// Configurable per-test so we can force chunking (e.g. maxLogs: 1) to drive the
// partial-chunk-failure path without rewiring the factory mock for each case.
const getProviderBatchLimit = vi.fn<() => { maxLogs: number; maxBytes: number }>(() => ({
  maxLogs: 1_000,
  maxBytes: 4 * 1024 * 1024
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/ee/services/audit-log-stream/audit-log-stream-fns", () => ({
  decryptLogStreamCredentials: async () => ({})
}));

// Every provider lookup returns the same shared batchStreamLog mock so tests can
// drive success/failure paths without rewiring the map per case.
vi.mock("../audit-log-stream/audit-log-stream-factory", () => ({
  LOG_STREAM_FACTORY_MAP: new Proxy(
    {},
    {
      get: () => () => ({
        batchStreamLog,
        validateCredentials: async ({ credentials }: { credentials: unknown }) => credentials,
        getProviderBatchLimit
      })
    }
  )
}));

const buildRow = (overrides: Partial<TAuditLogStreamOutboxRow> = {}): TAuditLogStreamOutboxRow => ({
  id: 1,
  streamId: STREAM_ID,
  orgId: ORG_ID,
  auditLogId: "log-1",
  payload: { id: "log-1" } as TAuditLogStreamOutboxRow["payload"],
  status: AuditLogStreamOutboxStatus.Processing,
  attempts: 0,
  nextRetryAt: new Date(),
  lockedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

const createService = () => {
  const onStreamFailure = vi.fn(async () => undefined);

  const auditLogStreamOutboxDAL = {
    batchInsert: vi.fn(async () => undefined),
    claimBatchForStream: vi.fn<(...args: unknown[]) => Promise<TAuditLogStreamOutboxRow[]>>(async () => []),
    commitDeliveryResult: vi.fn<(input: unknown) => Promise<void>>(async () => undefined),
    recoverStaleClaims: vi.fn(async () => ({ retried: 0, movedToDlq: 0 })),
    findStreamsWithOverdueRows: vi.fn(async () => []),
    deleteDeliveredOlderThan: vi.fn<(retentionMs: number) => Promise<number>>(async () => 0),
    deleteDlqOlderThan: vi.fn<(retentionMs: number) => Promise<number>>(async () => 0)
  };

  const auditLogStreamDAL = {
    find: vi.fn(async () => []),
    findById: vi.fn(async () => ({
      id: STREAM_ID,
      provider: PROVIDER,
      orgId: ORG_ID,
      encryptedCredentials: Buffer.from("x")
    }))
  };

  const service = auditLogStreamOutboxServiceFactory({
    auditLogStreamOutboxDAL: auditLogStreamOutboxDAL as never,
    auditLogStreamDAL: auditLogStreamDAL as never,
    kmsService: {} as never,
    keyStore: {} as never,
    queueService: {} as never,
    onStreamFailure
  });

  return { service, onStreamFailure, auditLogStreamOutboxDAL, auditLogStreamDAL };
};

describe("audit-log-stream-outbox-service drainStream failure wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to the generous default; tests that need chunking override per-call.
    getProviderBatchLimit.mockReturnValue({ maxLogs: 1_000, maxBytes: 4 * 1024 * 1024 });
  });

  test("invokes onStreamFailure with the truncated error message when the provider rejects", async () => {
    const { service, onStreamFailure, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(onStreamFailure).toHaveBeenCalledTimes(1);
    expect(onStreamFailure).toHaveBeenCalledWith({
      orgId: ORG_ID,
      streamId: STREAM_ID,
      provider: PROVIDER,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- asymmetric matcher is typed `any`
      errorMessage: expect.stringContaining(FAILURE_MESSAGE)
    });
    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhausted: TFailedStreamRow[];
    };
    expect(call.successIds).toEqual([]);
    expect(call.retriable?.groups.flatMap((g) => g.ids)).toEqual([1]);
    expect(call.exhausted).toEqual([]);
  });

  test("routes rows that hit MAX_ATTEMPTS to DLQ instead of retry", async () => {
    const { service, onStreamFailure, auditLogStreamOutboxDAL } = createService();

    // attempts=4 → attempts+1=5 hits MAX_ATTEMPTS so the row must go to DLQ.
    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([buildRow({ attempts: 4 })])
      .mockResolvedValueOnce([]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(onStreamFailure).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhausted: TFailedStreamRow[];
    };
    expect(call.successIds).toEqual([]);
    expect(call.retriable).toBeNull();
    expect(call.exhausted).toHaveLength(1);
    expect(call.exhausted[0].errorMessage).toEqual(expect.stringContaining(FAILURE_MESSAGE));
  });

  test("does not invoke onStreamFailure on the success path", async () => {
    const { service, onStreamFailure, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockResolvedValueOnce(undefined);

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(onStreamFailure).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhausted: TFailedStreamRow[];
    };
    expect(call.successIds).toEqual([1]);
    expect(call.retriable).toBeNull();
    expect(call.exhausted).toEqual([]);
  });

  test("stops draining after the first failed batch — does not claim another batch", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([buildRow()]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.claimBatchForStream).toHaveBeenCalledTimes(1);
  });

  test("partial-chunk failure: commits delivered rows + retries failed ones in one call", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    // maxLogs=1 → claim of 2 rows splits into 2 chunks. First send resolves,
    // second rejects: row 1 lands in successIds, row 2 in retriable. Both flow
    // through a single commitDeliveryResult so they share a transaction.
    getProviderBatchLimit.mockReturnValue({ maxLogs: 1, maxBytes: 4 * 1024 * 1024 });
    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([buildRow({ id: 1, auditLogId: "log-1" }), buildRow({ id: 2, auditLogId: "log-2" })])
      .mockResolvedValueOnce([]);
    batchStreamLog.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhausted: TFailedStreamRow[];
    };
    expect(call.successIds).toEqual([1]);
    expect(call.retriable?.groups.flatMap((g) => g.ids)).toEqual([2]);
    expect(call.exhausted).toEqual([]);
  });

  test("per-attempt backoff: rows at different attempts retry in separate groups with distinct delays", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    // One chunk (default maxLogs) carrying two rows with different attempt counts.
    // The single send rejects, so both are retriable but must land in separate
    // groups, each backed off by its own attempt count — not the batch max.
    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([
        buildRow({ id: 1, auditLogId: "log-1", attempts: 0 }),
        buildRow({ id: 2, auditLogId: "log-2", attempts: 3 })
      ])
      .mockResolvedValueOnce([]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhausted: TFailedStreamRow[];
    };
    const groups = call.retriable?.groups ?? [];
    expect(groups).toHaveLength(2);

    const groupForId = (id: number) => groups.find((g) => g.ids.includes(id));
    const lowAttemptGroup = groupForId(1);
    const highAttemptGroup = groupForId(2);

    expect(lowAttemptGroup?.ids).toEqual([1]);
    expect(highAttemptGroup?.ids).toEqual([2]);
    // The row that has already failed more times must wait strictly longer.
    expect(highAttemptGroup!.nextRetryDelayMs).toBeGreaterThan(lowAttemptGroup!.nextRetryDelayMs);
  });
});

describe("audit-log-stream-outbox-service enqueueForLogs batch fanout", () => {
  const buildService = () => {
    const auditLogStreamOutboxDAL = {
      batchInsert: vi.fn<(rows: unknown[]) => Promise<void>>(async () => undefined),
      claimBatchForStream: vi.fn(async () => []),
      commitDeliveryResult: vi.fn(async () => undefined),
      recoverStaleClaims: vi.fn(async () => ({ retried: 0, movedToDlq: 0 })),
      findStreamsWithOverdueRows: vi.fn(async () => []),
      deleteDeliveredOlderThan: vi.fn<(retentionMs: number) => Promise<number>>(async () => 0)
    };

    const auditLogStreamDAL = {
      find: vi.fn<
        (arg: { $in: { orgId: string[] } }) => Promise<{ id: string; orgId: string; provider: LogProvider }[]>
      >(async () => []),
      findById: vi.fn()
    };

    // Win the debounce SETNX so the flush job is always enqueued in these tests.
    const keyStore = { setItemWithExpiryNX: vi.fn(async () => true) };
    const queueService = { queue: vi.fn(async () => undefined) };

    const service = auditLogStreamOutboxServiceFactory({
      auditLogStreamOutboxDAL: auditLogStreamOutboxDAL as never,
      auditLogStreamDAL: auditLogStreamDAL as never,
      kmsService: {} as never,
      keyStore: keyStore as never,
      queueService: queueService as never
    });

    return { service, auditLogStreamOutboxDAL, auditLogStreamDAL, keyStore, queueService };
  };

  const log = (id: string, orgId?: string) => ({ id, orgId }) as TAuditLogStreamOutboxRow["payload"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("empty input does nothing", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL } = buildService();

    await service.enqueueForLogs([]);

    expect(auditLogStreamDAL.find).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.batchInsert).not.toHaveBeenCalled();
  });

  test("groups by org: one find per distinct org, one batchInsert, one debounce per stream", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, keyStore, queueService } = buildService();

    auditLogStreamDAL.find.mockImplementation(async ({ $in }) =>
      [
        { id: "sA", orgId: "orgA", provider: PROVIDER },
        { id: "sB", orgId: "orgB", provider: PROVIDER }
      ].filter((s) => $in.orgId.includes(s.orgId))
    );

    await service.enqueueForLogs([log("1", "orgA"), log("2", "orgA"), log("3", "orgB")]);

    // single batched lookup covering every distinct org
    expect(auditLogStreamDAL.find).toHaveBeenCalledTimes(1);
    // single batch insert: sA × 2 logs + sB × 1 log = 3 rows
    expect(auditLogStreamOutboxDAL.batchInsert).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.batchInsert.mock.calls[0][0]).toHaveLength(3);
    // debounce/wake once per distinct stream
    expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledTimes(2);
    expect(queueService.queue).toHaveBeenCalledTimes(2);
  });

  test("skips logs without an orgId", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL } = buildService();

    await service.enqueueForLogs([log("1")]);

    expect(auditLogStreamDAL.find).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.batchInsert).not.toHaveBeenCalled();
  });

  test("no active streams for the org → no insert, no debounce", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, keyStore } = buildService();
    auditLogStreamDAL.find.mockResolvedValue([]);

    await service.enqueueForLogs([log("1", "orgA")]);

    expect(auditLogStreamDAL.find).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.batchInsert).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });
});

describe("audit-log-stream-outbox-service pruneDeliveredRows", () => {
  test("delegates to DAL with the configured retention", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();
    auditLogStreamOutboxDAL.deleteDeliveredOlderThan.mockResolvedValueOnce(42);

    await service.pruneDeliveredRows();

    expect(auditLogStreamOutboxDAL.deleteDeliveredOlderThan).toHaveBeenCalledTimes(1);
    const [retentionMs] = auditLogStreamOutboxDAL.deleteDeliveredOlderThan.mock.calls[0];
    // Retention must be positive and at least an hour — guards against accidental
    // tightening that would defeat the dedup-window purpose of keeping delivered rows.
    expect(retentionMs).toBeGreaterThanOrEqual(60 * 60_000);
  });
});

describe("audit-log-stream-outbox-service pruneDlqEntries", () => {
  test("delegates to DAL with the configured retention", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();
    auditLogStreamOutboxDAL.deleteDlqOlderThan.mockResolvedValueOnce(7);

    await service.pruneDlqEntries();

    expect(auditLogStreamOutboxDAL.deleteDlqOlderThan).toHaveBeenCalledTimes(1);
    const [retentionMs] = auditLogStreamOutboxDAL.deleteDlqOlderThan.mock.calls[0];
    // DLQ retention should give operators at least a day to triage.
    expect(retentionMs).toBeGreaterThanOrEqual(24 * 60 * 60_000);
  });
});
