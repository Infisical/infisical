import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogStreamProduct, LogProvider, StreamMode } from "../audit-log-stream/audit-log-stream-enums";
import { auditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";
import { AuditLogStreamOutboxStatus, TAuditLogStreamOutboxRow } from "./audit-log-stream-outbox-types";

const STREAM_ID = "stream-1";
const ORG_ID = "org-1";
const PROVIDER = LogProvider.Datadog;

const FAILURE_MESSAGE = "upstream failure";

const batchStreamLog = vi.fn<(input: unknown) => Promise<void>>();
// Single-event delivery spy (used by "single" stream mode tests).
const streamLog = vi.fn<(input: unknown) => Promise<void>>();
// Configurable per-test so we can force chunking (e.g. maxLogs: 1) to drive the
// partial-chunk-failure path without rewiring the factory mock for each case.
const getProviderBatchLimit = vi.fn<() => { maxLogs: number; maxBytes: number }>(() => ({
  maxLogs: 1_000,
  maxBytes: 4 * 1024 * 1024
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// Keep the real product-filter helpers (auditLogMatchesStreamFilter, resolveAuditLogProduct) so
// the fanout filtering tests exercise actual behavior; only credential decryption is stubbed.
vi.mock("@app/ee/services/audit-log-stream/audit-log-stream-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/ee/services/audit-log-stream/audit-log-stream-fns")>()),
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
        streamLog,
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
  const auditLogStreamOutboxDAL = {
    batchInsert: vi.fn(async () => undefined),
    claimBatchForStream: vi.fn<(...args: unknown[]) => Promise<TAuditLogStreamOutboxRow[]>>(async () => []),
    commitDeliveryResult: vi.fn<(input: unknown) => Promise<void>>(async () => undefined),
    recoverStaleClaims: vi.fn(async () => ({ retried: 0, dropped: [] })),
    findStreamsWithOverdueRows: vi.fn(async () => []),
    deleteDeliveredOlderThan: vi.fn<(retentionMs: number) => Promise<number>>(async () => 0)
  };

  const auditLogStreamDAL = {
    find: vi.fn(async () => []),
    findById: vi.fn(async () => ({
      id: STREAM_ID,
      provider: PROVIDER,
      orgId: ORG_ID,
      encryptedCredentials: Buffer.from("x"),
      streamMode: StreamMode.Batch as StreamMode
    }))
  };

  const projectDAL = {
    findProjectTypesByIds: vi.fn(async () => [])
  };

  const service = auditLogStreamOutboxServiceFactory({
    auditLogStreamOutboxDAL: auditLogStreamOutboxDAL as never,
    auditLogStreamDAL: auditLogStreamDAL as never,
    projectDAL: projectDAL as never,
    kmsService: {} as never,
    keyStore: {} as never,
    queueService: {} as never
  });

  return { service, auditLogStreamOutboxDAL, auditLogStreamDAL, projectDAL };
};

describe("audit-log-stream-outbox-service drainStream failure handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to the generous default; tests that need chunking override per-call.
    getProviderBatchLimit.mockReturnValue({ maxLogs: 1_000, maxBytes: 4 * 1024 * 1024 });
  });

  test("retries the failed row when the provider rejects the batch", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([]);
    expect(call.retriable?.groups.flatMap((g) => g.ids)).toEqual([1]);
    expect(call.exhaustedIds).toEqual([]);
  });

  test("drops rows that hit MAX_ATTEMPTS instead of retrying them", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    // attempts=4 → attempts+1=5 hits MAX_ATTEMPTS so the row is dropped (no DLQ):
    // its id lands in exhaustedIds for deletion and nothing is queued for retry.
    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([buildRow({ attempts: 4 })])
      .mockResolvedValueOnce([]);
    batchStreamLog.mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([]);
    expect(call.retriable).toBeNull();
    expect(call.exhaustedIds).toEqual([1]);
  });

  test("commits delivered rows on the success path", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();

    auditLogStreamOutboxDAL.claimBatchForStream.mockResolvedValueOnce([buildRow()]).mockResolvedValueOnce([]);
    batchStreamLog.mockResolvedValueOnce(undefined);

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: PROVIDER });

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([1]);
    expect(call.retriable).toBeNull();
    expect(call.exhaustedIds).toEqual([]);
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
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([1]);
    expect(call.retriable?.groups.flatMap((g) => g.ids)).toEqual([2]);
    expect(call.exhaustedIds).toEqual([]);
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
      exhaustedIds: number[];
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

describe("audit-log-stream-outbox-service drainStream single mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProviderBatchLimit.mockReturnValue({ maxLogs: 1_000, maxBytes: 4 * 1024 * 1024 });
  });

  test("delivers one event per request via streamLog (not batchStreamLog)", async () => {
    const { service, auditLogStreamOutboxDAL, auditLogStreamDAL } = createService();

    auditLogStreamDAL.findById.mockResolvedValue({
      id: STREAM_ID,
      provider: LogProvider.Custom,
      orgId: ORG_ID,
      encryptedCredentials: Buffer.from("x"),
      streamMode: StreamMode.Single
    });

    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([buildRow({ id: 1, auditLogId: "log-1" }), buildRow({ id: 2, auditLogId: "log-2" })])
      .mockResolvedValueOnce([]);
    streamLog.mockResolvedValue(undefined);

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: LogProvider.Custom });

    // One HTTP call per row, never the array path.
    expect(streamLog).toHaveBeenCalledTimes(2);
    expect(batchStreamLog).not.toHaveBeenCalled();

    expect(auditLogStreamOutboxDAL.commitDeliveryResult).toHaveBeenCalledTimes(1);
    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([1, 2]);
    expect(call.retriable).toBeNull();
    expect(call.exhaustedIds).toEqual([]);
  });

  test("retries only the row whose single-event send failed", async () => {
    const { service, auditLogStreamOutboxDAL, auditLogStreamDAL } = createService();

    auditLogStreamDAL.findById.mockResolvedValue({
      id: STREAM_ID,
      provider: LogProvider.Custom,
      orgId: ORG_ID,
      encryptedCredentials: Buffer.from("x"),
      streamMode: StreamMode.Single
    });

    auditLogStreamOutboxDAL.claimBatchForStream
      .mockResolvedValueOnce([buildRow({ id: 1, auditLogId: "log-1" }), buildRow({ id: 2, auditLogId: "log-2" })])
      .mockResolvedValueOnce([]);
    // First row delivers, second row fails — only the second should retry.
    streamLog.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error(FAILURE_MESSAGE));

    await service.drainStream({ streamId: STREAM_ID, orgId: ORG_ID, provider: LogProvider.Custom });

    const call = auditLogStreamOutboxDAL.commitDeliveryResult.mock.calls[0][0] as {
      successIds: number[];
      retriable: { groups: { ids: number[]; nextRetryDelayMs: number }[] } | null;
      exhaustedIds: number[];
    };
    expect(call.successIds).toEqual([1]);
    expect(call.retriable?.groups.flatMap((g) => g.ids)).toEqual([2]);
    expect(call.exhaustedIds).toEqual([]);
  });
});

describe("audit-log-stream-outbox-service enqueueForLogs batch fanout", () => {
  const buildService = () => {
    const auditLogStreamOutboxDAL = {
      batchInsert: vi.fn<(rows: unknown[]) => Promise<void>>(async () => undefined),
      claimBatchForStream: vi.fn(async () => []),
      commitDeliveryResult: vi.fn(async () => undefined),
      recoverStaleClaims: vi.fn(async () => ({ retried: 0, dropped: [] })),
      findStreamsWithOverdueRows: vi.fn(async () => []),
      deleteDeliveredOlderThan: vi.fn<(retentionMs: number) => Promise<number>>(async () => 0)
    };

    const auditLogStreamDAL = {
      find: vi.fn<
        (arg: { $in: { orgId: string[] } }) => Promise<{ id: string; orgId: string; provider: LogProvider }[]>
      >(async () => []),
      findById: vi.fn()
    };

    const projectDAL = {
      findProjectTypesByIds: vi.fn(async () => [])
    };

    // Win the debounce SETNX so the flush job is always enqueued in these tests.
    const keyStore = { setItemWithExpiryNX: vi.fn(async () => true) };
    const queueService = { queue: vi.fn(async () => undefined) };

    const service = auditLogStreamOutboxServiceFactory({
      auditLogStreamOutboxDAL: auditLogStreamOutboxDAL as never,
      auditLogStreamDAL: auditLogStreamDAL as never,
      projectDAL: projectDAL as never,
      kmsService: {} as never,
      keyStore: keyStore as never,
      queueService: queueService as never
    });

    return { service, auditLogStreamOutboxDAL, auditLogStreamDAL, projectDAL, keyStore, queueService };
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

  // A log carrying a projectId, used to exercise product-scoped streams.
  const projectLog = (id: string, orgId: string, projectId: string) =>
    ({ id, orgId, projectId }) as TAuditLogStreamOutboxRow["payload"];

  test("no stream has a product filter → project types are never resolved (zero-overhead path)", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, projectDAL } = buildService();
    auditLogStreamDAL.find.mockResolvedValue([{ id: "sA", orgId: "orgA", provider: PROVIDER }] as never);

    await service.enqueueForLogs([projectLog("1", "orgA", "projPki")]);

    expect(projectDAL.findProjectTypesByIds).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxDAL.batchInsert.mock.calls[0][0]).toHaveLength(1);
  });

  test("product-scoped stream only receives logs whose product matches", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, projectDAL, keyStore, queueService } = buildService();

    // One stream scoped to PKI + org-level events.
    auditLogStreamDAL.find.mockResolvedValue([
      {
        id: "sA",
        orgId: "orgA",
        provider: PROVIDER,
        filters: { products: [AuditLogStreamProduct.CertificateManager, AuditLogStreamProduct.Organization] }
      }
    ] as never);

    projectDAL.findProjectTypesByIds.mockResolvedValue([
      { id: "projPki", type: AuditLogStreamProduct.CertificateManager },
      { id: "projSecrets", type: AuditLogStreamProduct.SecretManager }
    ] as never);

    await service.enqueueForLogs([
      projectLog("pki", "orgA", "projPki"), // matches (cert-manager)
      projectLog("secrets", "orgA", "projSecrets"), // filtered out (secret-manager)
      log("orgLevel", "orgA") // matches (organization, no projectId)
    ]);

    expect(projectDAL.findProjectTypesByIds).toHaveBeenCalledTimes(1);
    const inserted = auditLogStreamOutboxDAL.batchInsert.mock.calls[0][0] as { payload: { id: string } }[];
    expect(inserted.map((r) => r.payload.id).sort()).toEqual(["orgLevel", "pki"]);
    // The stream received rows, so it is woken exactly once.
    expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledTimes(1);
    expect(queueService.queue).toHaveBeenCalledTimes(1);
  });

  test("a stream whose every log is filtered out is not inserted or woken", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, projectDAL, keyStore } = buildService();

    auditLogStreamDAL.find.mockResolvedValue([
      { id: "sA", orgId: "orgA", provider: PROVIDER, filters: { products: [AuditLogStreamProduct.KMS] } }
    ] as never);
    projectDAL.findProjectTypesByIds.mockResolvedValue([
      { id: "projPki", type: AuditLogStreamProduct.CertificateManager }
    ] as never);

    await service.enqueueForLogs([projectLog("pki", "orgA", "projPki")]);

    expect(auditLogStreamOutboxDAL.batchInsert).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });

  test("unresolvable project log (hard-deleted project) is not misrouted to an org-filtered stream", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, projectDAL, keyStore } = buildService();

    // Stream scoped to org-level events only. A log whose project was hard-deleted (so it is absent
    // from the type lookup) must NOT leak into this stream as if it were an Organization event.
    auditLogStreamDAL.find.mockResolvedValue([
      { id: "sOrg", orgId: "orgA", provider: PROVIDER, filters: { products: [AuditLogStreamProduct.Organization] } }
    ] as never);
    // Lookup returns nothing for the projectId — the project no longer exists.
    projectDAL.findProjectTypesByIds.mockResolvedValue([] as never);

    await service.enqueueForLogs([projectLog("orphan", "orgA", "projGone")]);

    expect(projectDAL.findProjectTypesByIds).toHaveBeenCalledTimes(1);
    expect(auditLogStreamOutboxDAL.batchInsert).not.toHaveBeenCalled();
    expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
  });

  test("unresolvable project log still reaches an unfiltered catch-all stream", async () => {
    const { service, auditLogStreamDAL, auditLogStreamOutboxDAL, projectDAL } = buildService();

    // One product-filtered stream (must skip the orphan log) and one unfiltered stream (must keep it).
    auditLogStreamDAL.find.mockResolvedValue([
      { id: "sFiltered", orgId: "orgA", provider: PROVIDER, filters: { products: [AuditLogStreamProduct.KMS] } },
      { id: "sCatchAll", orgId: "orgA", provider: PROVIDER }
    ] as never);
    projectDAL.findProjectTypesByIds.mockResolvedValue([] as never);

    await service.enqueueForLogs([projectLog("orphan", "orgA", "projGone")]);

    const inserted = auditLogStreamOutboxDAL.batchInsert.mock.calls[0][0] as { streamId: string }[];
    // Only the catch-all stream receives it; the KMS-filtered stream does not.
    expect(inserted.map((r) => r.streamId)).toEqual(["sCatchAll"]);
  });
});

describe("audit-log-stream-outbox-service pruneDeliveredRows", () => {
  test("delegates to DAL with the configured retention", async () => {
    const { service, auditLogStreamOutboxDAL } = createService();
    auditLogStreamOutboxDAL.deleteDeliveredOlderThan.mockResolvedValueOnce(42);

    await service.pruneDeliveredRows();

    expect(auditLogStreamOutboxDAL.deleteDeliveredOlderThan).toHaveBeenCalledTimes(1);
    const [retentionMs] = auditLogStreamOutboxDAL.deleteDeliveredOlderThan.mock.calls[0];
    // Retention must comfortably outlive the ~5s ingest-stream trim window so the
    // delivered rows still serve their dedup-guard purpose — guards against accidental
    // tightening down toward that window.
    expect(retentionMs).toBeGreaterThanOrEqual(5 * 60_000);
  });
});
