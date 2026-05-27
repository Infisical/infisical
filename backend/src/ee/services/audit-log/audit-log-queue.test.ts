import { beforeEach, describe, expect, test, vi } from "vitest";

import { QueueName } from "@app/queue";

import { auditLogQueueServiceFactory } from "./audit-log-queue";

// Mutable config the mocked getConfig() returns. CLICKHOUSE_AUDIT_LOG_ENABLED is read once at
// factory construction; AUDIT_LOG_STREAMS_ENABLED is read per consumer run.
const mockConfig = {
  CLICKHOUSE_AUDIT_LOG_ENABLED: false,
  CLICKHOUSE_AUDIT_LOG_TABLE_NAME: "audit_logs",
  CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS: {},
  AUDIT_LOG_STREAMS_ENABLED: false,
  DISABLE_POSTGRES_AUDIT_LOG_STORAGE: false
};

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const STREAM_KEY = "audit-log-stream";

const streamEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "log-1",
  createdAt: new Date("2026-05-27T00:00:00.000Z").toISOString(),
  event: { type: "test-event", metadata: { k: "v" } },
  actor: { type: "platform", metadata: {} },
  orgId: "org-1",
  ...overrides
});

// streamCollect returns [entryId, ["data", json]] tuples; the consumer parses fields[1].
const collectResult = (payloads: Record<string, unknown>[], lastId = "9-0") => ({
  entries: payloads.map((p, i) => [`${i + 1}-0`, ["data", JSON.stringify(p)]] as [string, string[]]),
  lastId
});

const createHarness = async ({ clickhouse = false, streamsEnabled = false } = {}) => {
  mockConfig.CLICKHOUSE_AUDIT_LOG_ENABLED = clickhouse;
  mockConfig.AUDIT_LOG_STREAMS_ENABLED = streamsEnabled;

  const startHandlers = new Map<string, (job?: unknown) => Promise<void>>();
  const queueService = {
    start: vi.fn((name: string, fn: (job?: unknown) => Promise<void>) => {
      startHandlers.set(name, fn);
    }),
    queue: vi.fn(async () => undefined),
    upsertJobScheduler: vi.fn(async () => undefined)
  };

  const keyStore = {
    streamAdd: vi.fn<
      (key: string, id: string, fieldValue: { data: string }, maxLen?: number) => Promise<string | null>
    >(async () => "1-0"),
    streamCollect: vi.fn<() => Promise<{ entries: [string, string[]][]; lastId: string | null }>>(async () => ({
      entries: [],
      lastId: null
    })),
    streamTrim: vi.fn<(key: string, minId: string, inclusive?: boolean) => Promise<number>>(async () => 0)
  };

  const auditLogDAL = { batchCreate: vi.fn<(logs: Record<string, unknown>[]) => Promise<void>>(async () => undefined) };
  const projectDAL = {
    findById: vi.fn<(id: string) => Promise<Record<string, unknown> | undefined>>(async () => undefined)
  };
  const licenseService = {
    getPlan: vi.fn<(orgId: string) => Promise<{ auditLogsRetentionDays: number }>>(async () => ({
      auditLogsRetentionDays: 30
    }))
  };
  const auditLogStreamOutboxService = {
    enqueueForLogs: vi.fn<(logs: unknown[]) => Promise<void>>(async () => undefined)
  };
  const clickhouseClient = clickhouse
    ? {
        insert: vi.fn<(opts: { table: string; values: Record<string, unknown>[] }) => Promise<unknown>>(
          async () => undefined
        )
      }
    : null;

  const service = await auditLogQueueServiceFactory({
    auditLogDAL: auditLogDAL as never,
    queueService: queueService as never,
    projectDAL: projectDAL as never,
    licenseService: licenseService as never,
    auditLogStreamOutboxService: auditLogStreamOutboxService as never,
    clickhouseClient: clickhouseClient as never,
    keyStore: keyStore as never
  });

  return {
    service,
    queueService,
    keyStore,
    auditLogDAL,
    projectDAL,
    licenseService,
    auditLogStreamOutboxService,
    clickhouseClient,
    consumer: startHandlers.get(QueueName.AuditLogClickHouseBatch)!,
    shim: startHandlers.get(QueueName.AuditLog)!
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audit-log-queue pushToLog", () => {
  test("appends a stream entry with a pinned id and an ISO createdAt", async () => {
    const { service, keyStore } = await createHarness();

    await service.pushToLog({
      event: { type: "e", metadata: {} },
      actor: { type: "platform", metadata: {} },
      orgId: "org-1"
    } as never);

    expect(keyStore.streamAdd).toHaveBeenCalledTimes(1);
    const [key, id, fields] = keyStore.streamAdd.mock.calls[0];
    expect(key).toBe(STREAM_KEY);
    expect(id).toBe("*");
    const parsed = JSON.parse(fields.data) as { id: string; createdAt: string };
    expect(typeof parsed.id).toBe("string");
    expect(parsed.id).toHaveLength(36);
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
  });

  test("never throws when streamAdd fails", async () => {
    const { service, keyStore } = await createHarness();
    keyStore.streamAdd.mockRejectedValueOnce(new Error("redis down"));

    await expect(
      service.pushToLog({
        event: { type: "e", metadata: {} },
        actor: { type: "platform", metadata: {} },
        orgId: "o"
      } as never)
    ).resolves.toBeUndefined();
  });

  test("compatibility shim re-routes legacy jobs into the stream", async () => {
    const { shim, keyStore } = await createHarness();

    await shim({ data: { event: { type: "e", metadata: {} }, actor: { type: "platform", metadata: {} }, orgId: "o" } });

    expect(keyStore.streamAdd).toHaveBeenCalledTimes(1);
  });
});

describe("audit-log-queue unified consumer", () => {
  test("does nothing on an empty stream", async () => {
    const { consumer, auditLogDAL, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce({ entries: [], lastId: null });

    await consumer();

    expect(auditLogDAL.batchCreate).not.toHaveBeenCalled();
    expect(keyStore.streamTrim).not.toHaveBeenCalled();
  });

  test("postgres branch batch-inserts with null-normalized empties + projectName, then trims", async () => {
    const { consumer, auditLogDAL, projectDAL, keyStore } = await createHarness();
    projectDAL.findById.mockResolvedValue({ orgId: "org-1", name: "proj", auditLogsRetentionDays: null });
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([streamEntry({ orgId: undefined, projectId: "p1", ipAddress: undefined })])
    );

    await consumer();

    expect(auditLogDAL.batchCreate).toHaveBeenCalledTimes(1);
    const rows = auditLogDAL.batchCreate.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].ipAddress).toBeNull();
    expect(rows[0].projectName).toBe("proj");
    expect(rows[0].orgId).toBe("org-1");
    expect(keyStore.streamTrim).toHaveBeenCalledWith(STREAM_KEY, "9-0", true);
  });

  test("clickhouse branch inserts with empty-string empties and no projectName", async () => {
    const { consumer, clickhouseClient, keyStore } = await createHarness({ clickhouse: true });
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry({ ipAddress: undefined })]));

    await consumer();

    expect(clickhouseClient!.insert).toHaveBeenCalledTimes(1);
    const args = clickhouseClient!.insert.mock.calls[0][0];
    expect(args.values).toHaveLength(1);
    expect(args.values[0].ipAddress).toBe("");
    expect(args.values[0]).not.toHaveProperty("projectName");
  });

  test("drops entries failing skip rules and inserts only survivors", async () => {
    const { consumer, auditLogDAL, projectDAL, licenseService, keyStore } = await createHarness();
    projectDAL.findById.mockImplementation(async (id: string) =>
      id === "pD" ? { orgId: "orgD", name: "d" } : undefined
    );
    licenseService.getPlan.mockImplementation(async (orgId: string) => ({
      auditLogsRetentionDays: orgId === "orgZero" ? 0 : 30
    }));
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([
        streamEntry({ id: "A", orgId: undefined, projectId: undefined }), // neither → drop
        streamEntry({ id: "B", orgId: undefined, projectId: "pB" }), // project deleted → drop
        streamEntry({ id: "C", orgId: "orgZero" }), // retention 0 → drop
        streamEntry({ id: "D", orgId: undefined, projectId: "pD" }) // valid
      ])
    );

    await consumer();

    const rows = auditLogDAL.batchCreate.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("D");
    expect(keyStore.streamTrim).toHaveBeenCalledTimes(1);
  });

  test("dedups project and plan lookups across the batch", async () => {
    const { consumer, projectDAL, licenseService, keyStore } = await createHarness();
    projectDAL.findById.mockImplementation(async (id: string) => ({ orgId: id === "p1" ? "orgA" : "orgB", name: id }));
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([
        streamEntry({ id: "1", orgId: undefined, projectId: "p1" }),
        streamEntry({ id: "2", orgId: undefined, projectId: "p1" }),
        streamEntry({ id: "3", orgId: undefined, projectId: "p2" }),
        streamEntry({ id: "4", orgId: "orgA" })
      ])
    );

    await consumer();

    expect(projectDAL.findById).toHaveBeenCalledTimes(2); // p1, p2
    expect(licenseService.getPlan).toHaveBeenCalledTimes(2); // orgA, orgB
  });

  test("insert failure skips both the outbox and the trim", async () => {
    const { consumer, auditLogDAL, auditLogStreamOutboxService, keyStore } = await createHarness({
      streamsEnabled: true
    });
    auditLogDAL.batchCreate.mockRejectedValueOnce(new Error("db down"));
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(keyStore.streamTrim).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxService.enqueueForLogs).not.toHaveBeenCalled();
  });

  test("on success runs insert → outbox → trim in order", async () => {
    const { consumer, auditLogDAL, auditLogStreamOutboxService, keyStore } = await createHarness({
      streamsEnabled: true
    });
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    const insertOrder = auditLogDAL.batchCreate.mock.invocationCallOrder[0];
    const outboxOrder = auditLogStreamOutboxService.enqueueForLogs.mock.invocationCallOrder[0];
    const trimOrder = keyStore.streamTrim.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(outboxOrder);
    expect(outboxOrder).toBeLessThan(trimOrder);
  });

  test("outbox failure after a successful insert still trims", async () => {
    const { consumer, auditLogStreamOutboxService, keyStore } = await createHarness({ streamsEnabled: true });
    auditLogStreamOutboxService.enqueueForLogs.mockRejectedValueOnce(new Error("outbox down"));
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(keyStore.streamTrim).toHaveBeenCalledTimes(1);
  });

  test("does not fan out to the outbox when AUDIT_LOG_STREAMS_ENABLED is false", async () => {
    const { consumer, auditLogStreamOutboxService, keyStore } = await createHarness({ streamsEnabled: false });
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(auditLogStreamOutboxService.enqueueForLogs).not.toHaveBeenCalled();
  });

  test("an all-dropped batch still trims without inserting", async () => {
    const { consumer, auditLogDAL, licenseService, keyStore } = await createHarness();
    licenseService.getPlan.mockResolvedValue({ auditLogsRetentionDays: 0 });
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry(), streamEntry({ id: "log-2" })]));

    await consumer();

    expect(auditLogDAL.batchCreate).not.toHaveBeenCalled();
    expect(keyStore.streamTrim).toHaveBeenCalledTimes(1);
  });

  test("skips unparseable entries and processes the rest", async () => {
    const { consumer, auditLogDAL, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce({
      entries: [
        ["1-0", ["data", "not-json{"]],
        ["2-0", ["data", JSON.stringify(streamEntry({ id: "ok" }))]]
      ],
      lastId: "2-0"
    });

    await consumer();

    const rows = auditLogDAL.batchCreate.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("ok");
  });
});
