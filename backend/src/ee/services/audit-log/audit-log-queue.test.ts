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
const MS_IN_DAY = 24 * 60 * 60 * 1000;

// A push-time DTO (what pushToLog receives — no resolved metadata yet).
const dto = (overrides: Record<string, unknown> = {}) => ({
  event: { type: "test-event", metadata: { k: "v" } },
  actor: { type: "platform", metadata: {} },
  orgId: "org-1",
  ...overrides
});

// A fully-resolved stream entry (what the consumer reads — org/expiresAt/projectName pinned at
// push time). createdAt/expiresAt default 30 days apart to mirror a resolved retention window.
const streamEntry = (overrides: Record<string, unknown> = {}) => ({
  id: "log-1",
  createdAt: new Date("2026-05-27T00:00:00.000Z").toISOString(),
  expiresAt: new Date("2026-06-26T00:00:00.000Z").toISOString(),
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

  const release = vi.fn(async () => undefined);
  const keyStore = {
    streamAdd: vi.fn<
      (key: string, id: string, fieldValue: { data: string }, maxLen?: number) => Promise<string | null>
    >(async () => "1-0"),
    streamCollect: vi.fn<() => Promise<{ entries: [string, string[]][]; lastId: string | null }>>(async () => ({
      entries: [],
      lastId: null
    })),
    streamTrim: vi.fn<(key: string, minId: string, inclusive?: boolean) => Promise<number>>(async () => 0),
    acquireLock: vi.fn<
      (
        resources: string[],
        duration: number,
        settings?: { retryCount?: number }
      ) => Promise<{ release: typeof release }>
    >(async () => ({ release }))
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
    release,
    auditLogDAL,
    projectDAL,
    licenseService,
    auditLogStreamOutboxService,
    clickhouseClient,
    consumer: startHandlers.get(QueueName.AuditLogClickHouseBatch)!
  };
};

// Read the single stream entry that was pushed via streamAdd.
const pushedEntry = (keyStore: { streamAdd: { mock: { calls: unknown[][] } } }) =>
  JSON.parse((keyStore.streamAdd.mock.calls[0][2] as { data: string }).data) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("audit-log-queue pushToLog", () => {
  test("resolves the entry and appends it with a pinned id, ISO timestamps, and orgId", async () => {
    const { service, keyStore } = await createHarness();

    await service.pushToLog(dto({ orgId: "org-1" }) as never);

    expect(keyStore.streamAdd).toHaveBeenCalledTimes(1);
    const [key, id, fields] = keyStore.streamAdd.mock.calls[0];
    expect(key).toBe(STREAM_KEY);
    expect(id).toBe("*");
    const parsed = JSON.parse(fields.data) as { id: string; createdAt: string; expiresAt: string; orgId: string };
    expect(typeof parsed.id).toBe("string");
    expect(parsed.id).toHaveLength(36);
    expect(new Date(parsed.createdAt).toISOString()).toBe(parsed.createdAt);
    expect(new Date(parsed.expiresAt).toISOString()).toBe(parsed.expiresAt);
    expect(parsed.orgId).toBe("org-1");
  });

  test("resolves orgId + projectName via the project for an org-less (project-scoped) event", async () => {
    const { service, keyStore, projectDAL } = await createHarness();
    projectDAL.findById.mockResolvedValueOnce({ id: "p1", orgId: "org-1", name: "proj", auditLogsRetentionDays: null });

    await service.pushToLog(dto({ orgId: undefined, projectId: "p1" }) as never);

    expect(projectDAL.findById).toHaveBeenCalledWith("p1");
    const parsed = pushedEntry(keyStore);
    expect(parsed.orgId).toBe("org-1");
    expect(parsed.projectName).toBe("proj");
  });

  test("caps the TTL at the project-level retention when it is lower than the plan", async () => {
    const { service, keyStore, projectDAL, licenseService } = await createHarness();
    projectDAL.findById.mockResolvedValueOnce({ id: "p1", orgId: "org-1", name: "proj", auditLogsRetentionDays: 5 });
    licenseService.getPlan.mockResolvedValueOnce({ auditLogsRetentionDays: 30 });

    await service.pushToLog(dto({ orgId: undefined, projectId: "p1" }) as never);

    const parsed = pushedEntry(keyStore);
    const ttl = new Date(parsed.expiresAt as string).getTime() - new Date(parsed.createdAt as string).getTime();
    expect(ttl).toBe(5 * MS_IN_DAY);
  });

  test("drops (no streamAdd) an entry with neither orgId nor projectId", async () => {
    const { service, keyStore } = await createHarness();

    await service.pushToLog(dto({ orgId: undefined, projectId: undefined }) as never);

    expect(keyStore.streamAdd).not.toHaveBeenCalled();
  });

  test("drops (no streamAdd) when the project was deleted", async () => {
    const { service, keyStore, projectDAL } = await createHarness();
    projectDAL.findById.mockResolvedValueOnce(undefined);

    await service.pushToLog(dto({ orgId: undefined, projectId: "gone" }) as never);

    expect(keyStore.streamAdd).not.toHaveBeenCalled();
  });

  test("drops (no streamAdd) when audit log retention is 0/unset", async () => {
    const { service, keyStore, licenseService } = await createHarness();
    licenseService.getPlan.mockResolvedValueOnce({ auditLogsRetentionDays: 0 });

    await service.pushToLog(dto({ orgId: "org-zero" }) as never);

    expect(keyStore.streamAdd).not.toHaveBeenCalled();
  });

  test("never throws when streamAdd fails", async () => {
    const { service, keyStore } = await createHarness();
    keyStore.streamAdd.mockRejectedValueOnce(new Error("redis down"));

    await expect(service.pushToLog(dto({ orgId: "o" }) as never)).resolves.toBeUndefined();
  });

  test("never throws when a resolution lookup fails", async () => {
    const { service, keyStore, licenseService } = await createHarness();
    licenseService.getPlan.mockRejectedValueOnce(new Error("license service down"));

    await expect(service.pushToLog(dto({ orgId: "o" }) as never)).resolves.toBeUndefined();
    expect(keyStore.streamAdd).not.toHaveBeenCalled();
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

  test("does not perform any DB lookups while draining", async () => {
    const { consumer, projectDAL, licenseService, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry({ projectId: "p1" })]));

    await consumer();

    expect(projectDAL.findById).not.toHaveBeenCalled();
    expect(licenseService.getPlan).not.toHaveBeenCalled();
  });

  test("postgres branch inserts the resolved entry (null-normalized empties + projectName), then trims", async () => {
    const { consumer, auditLogDAL, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([streamEntry({ orgId: "org-1", projectId: "p1", projectName: "proj", ipAddress: undefined })])
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

  test("drops entries missing resolved metadata and inserts only survivors", async () => {
    const { consumer, auditLogDAL, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([
        streamEntry({ id: "A", orgId: undefined }), // missing resolved orgId → drop
        streamEntry({ id: "B", expiresAt: undefined }), // missing resolved expiresAt → drop
        streamEntry({ id: "C" }) // valid
      ])
    );

    await consumer();

    const rows = auditLogDAL.batchCreate.mock.calls[0][0];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("C");
    expect(keyStore.streamTrim).toHaveBeenCalledTimes(1);
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

  test("outbox failure after a successful insert skips the trim so the batch is reprocessed", async () => {
    const { consumer, auditLogStreamOutboxService, keyStore } = await createHarness({ streamsEnabled: true });
    auditLogStreamOutboxService.enqueueForLogs.mockRejectedValueOnce(new Error("outbox down"));
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(keyStore.streamTrim).not.toHaveBeenCalled();
  });

  test("does not fan out to the outbox when AUDIT_LOG_STREAMS_ENABLED is false", async () => {
    const { consumer, auditLogStreamOutboxService, keyStore } = await createHarness({ streamsEnabled: false });
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(auditLogStreamOutboxService.enqueueForLogs).not.toHaveBeenCalled();
  });

  test("an all-dropped batch still trims without inserting", async () => {
    const { consumer, auditLogDAL, keyStore } = await createHarness();
    keyStore.streamCollect.mockResolvedValueOnce(
      collectResult([streamEntry({ orgId: undefined }), streamEntry({ id: "log-2", orgId: undefined })])
    );

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

  test("skips the tick when the consumer lock is already held by another runner", async () => {
    const { consumer, auditLogDAL, keyStore, release } = await createHarness();
    keyStore.acquireLock.mockRejectedValueOnce(new Error("ResourceLockedError"));
    keyStore.streamCollect.mockResolvedValueOnce(collectResult([streamEntry()]));

    await consumer();

    expect(keyStore.streamCollect).not.toHaveBeenCalled();
    expect(auditLogDAL.batchCreate).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });

  test("releases the consumer lock even when the drain throws", async () => {
    const { consumer, keyStore, release } = await createHarness();
    keyStore.streamCollect.mockRejectedValueOnce(new Error("redis hiccup"));

    await expect(consumer()).rejects.toThrow("redis hiccup");

    expect(release).toHaveBeenCalledTimes(1);
  });
});
