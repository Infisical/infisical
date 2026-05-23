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
    markBatchForRetry: vi.fn(async () => undefined),
    moveToDlq: vi.fn(async () => undefined),
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
      errorMessage: expect.stringContaining(FAILURE_MESSAGE)
    });
    expect(auditLogStreamOutboxDAL.markBatchForRetry).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.moveToDlq).not.toHaveBeenCalled();
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
    expect(auditLogStreamOutboxDAL.moveToDlq).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.markBatchForRetry).not.toHaveBeenCalled();
  });

  test("does not invoke onStreamFailure on the success path", async () => {
    const { service, onStreamFailure, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockResolvedValueOnce(undefined);

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(onStreamFailure).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.deleteByIds).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.markBatchForRetry).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.moveToDlq).not.toHaveBeenCalled();
  });

  test("stops draining after the first failed batch — does not claim another batch", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([buildRow()]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.claimBatchForStream).toHaveBeenCalledTimes(1);
  });
});
