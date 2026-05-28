import { beforeEach, describe, expect, test, vi } from "vitest";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { auditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";
import { AuditLogStreamOutboxStatus, TAuditLogStreamOutboxRow } from "./audit-log-stream-outbox-types";

const STREAM_ID = "stream-1";
const ORG_ID = "org-1";
const PROVIDER = LogProvider.Datadog;

const FAILURE_MESSAGE = "upstream failure";

const batchStreamLog = vi.fn<(input: unknown) => Promise<void>>();

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
        validateCredentials: async ({ credentials }: { credentials: unknown }) => credentials
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
  workerId: "worker-1",
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

const createService = () => {
  const onStreamFailure = vi.fn(async () => undefined);

  const auditLogStreamOutboxDAL = {
    batchInsert: vi.fn(async () => undefined),
    claimBatchForStream: vi.fn<(...args: unknown[]) => Promise<TAuditLogStreamOutboxRow[]>>(async () => []),
    deleteByIds: vi.fn(async () => undefined),
    applyBatchFailure: vi.fn(async () => undefined),
    recoverStaleClaims: vi.fn(async () => ({ retried: 0, movedToDlq: 0 }))
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
    expect(auditLogStreamOutboxDAL.applyBatchFailure).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.applyBatchFailure.mock.calls[0][0]).toMatchObject({
      retriable: { ids: [1] },
      exhausted: []
    });
    expect(auditLogStreamOutboxDAL.deleteByIds).not.toHaveBeenCalled();
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
    expect(auditLogStreamOutboxDAL.applyBatchFailure).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.applyBatchFailure.mock.calls[0][0] as {
      retriable: unknown;
      exhausted: TAuditLogStreamOutboxRow[];
    };
    expect(call.retriable).toBeNull();
    expect(call.exhausted).toHaveLength(1);
  });

  test("does not invoke onStreamFailure on the success path", async () => {
    const { service, onStreamFailure, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockResolvedValueOnce(undefined);

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(onStreamFailure).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.deleteByIds).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.applyBatchFailure).not.toHaveBeenCalled();
  });

  test("stops draining after the first failed batch — does not claim another batch", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([buildRow()]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.claimBatchForStream).toHaveBeenCalledTimes(1);
  });
});

describe("audit-log-stream-outbox-service enqueueForLogs batch fanout", () => {
  const buildService = () => {
    const auditLogStreamOutboxDAL = {
      batchInsert: vi.fn<(rows: unknown[]) => Promise<void>>(async () => undefined),
      claimBatchForStream: vi.fn(async () => []),
      deleteByIds: vi.fn(async () => undefined),
      applyBatchFailure: vi.fn(async () => undefined),
      recoverStaleClaims: vi.fn(async () => ({ retried: 0, movedToDlq: 0 }))
    };

    const auditLogStreamDAL = {
      find: vi.fn<(arg: { orgId: string }) => Promise<{ id: string; provider: LogProvider }[]>>(async () => []),
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

    auditLogStreamDAL.find.mockImplementation(async ({ orgId }) => {
      if (orgId === "orgA") return [{ id: "sA", provider: PROVIDER }];
      if (orgId === "orgB") return [{ id: "sB", provider: PROVIDER }];
      return [];
    });

    await service.enqueueForLogs([log("1", "orgA"), log("2", "orgA"), log("3", "orgB")]);

    // one lookup per distinct org
    expect(auditLogStreamDAL.find).toHaveBeenCalledTimes(2);
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
