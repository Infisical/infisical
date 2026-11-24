import { beforeEach, describe, expect, test, vi } from "vitest";

import { NotFoundError } from "@app/lib/errors";
import { QueueJobs, QueueName } from "@app/queue";

import { TPamSessionActivitySession } from "./pam-session-activity-fns";
import { pamSessionActivityServiceFactory } from "./pam-session-activity-service";
import { PamSessionActivityEventType, TPamSessionActivityEvent } from "./pam-session-activity-types";

const mockConfig = { AUDIT_LOG_STREAMS_ENABLED: true, DISABLE_AUDIT_LOG_GENERATION: false };

vi.mock("@app/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/config/env")>()),
  getConfig: () => mockConfig
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const session = {
  id: "0f0e0d0c-0b0a-4908-8706-050403020100",
  projectId: "pam-project",
  accountId: null,
  accountName: "prod-db",
  accountType: "postgres",
  folderName: null,
  selectedHost: null,
  userId: "11111111-2222-4333-8444-555555555555",
  identityId: null,
  actorName: "Jane Doe",
  actorEmail: "jane@example.com",
  actorIp: "10.0.0.7",
  actorUserAgent: "infisical-cli"
} satisfies TPamSessionActivitySession;

const stream = (id: string, filters: unknown) => ({ id, orgId: "org-1", provider: "custom", filters });

type TRows = { stream: { id: string }; payload: TPamSessionActivityEvent }[];

const primary = { node: "primary" };

const buildService = (
  streams: ReturnType<typeof stream>[],
  {
    storedSession = { ...session, encryptedSessionKey: Buffer.from("key") },
    chunk = {
      events: [{ timestamp: "2026-11-19T10:00:00.000Z", input: "SELECT secret FROM vault", output: "hunter2" }]
    }
  }: { storedSession?: Record<string, unknown> | null; chunk?: unknown } = {}
) => {
  let handler: ((job: { data: unknown; attemptsMade: number }) => Promise<void>) | undefined;
  const queueService = {
    queue: vi.fn(async () => undefined),
    start: vi.fn((_name: QueueName, jobHandler: typeof handler) => {
      handler = jobHandler;
    })
  };
  const auditLogStreamDAL = { find: vi.fn(async () => streams), primaryNode: vi.fn(() => primary) };
  const auditLogStreamOutboxService = { enqueueStreamEvents: vi.fn(async () => undefined) };
  const pamSessionDAL = { findById: vi.fn(async () => storedSession) };
  const pamSessionChunkService = { readChunkEvents: vi.fn(async () => chunk) };

  const service = pamSessionActivityServiceFactory({
    queueService: queueService as never,
    auditLogStreamDAL: auditLogStreamDAL as never,
    auditLogStreamOutboxService,
    pamSessionDAL: pamSessionDAL as never,
    pamSessionChunkService: pamSessionChunkService as never
  });
  service.init();

  const runJob = (data: { orgId: string; sessionId: string; chunkIndex: number }, attemptsMade = 0) =>
    handler!({ data, attemptsMade });
  const enqueuedRows = () => auditLogStreamOutboxService.enqueueStreamEvents.mock.calls[0] as unknown as [TRows];

  return {
    service,
    queueService,
    auditLogStreamDAL,
    auditLogStreamOutboxService,
    pamSessionChunkService,
    runJob,
    enqueuedRows
  };
};

const job = { orgId: "org-1", sessionId: session.id, chunkIndex: 2 };
const commandsOnly = { pamSessionActivity: { includeOutput: false } };
const withOutput = { pamSessionActivity: { includeOutput: true } };

describe("pamSessionActivityService", () => {
  beforeEach(() => {
    mockConfig.AUDIT_LOG_STREAMS_ENABLED = true;
    mockConfig.DISABLE_AUDIT_LOG_GENERATION = false;
  });

  test("queues a chunk export when a stream receives session activity", async () => {
    const { service, queueService, auditLogStreamDAL } = buildService([stream("s1", commandsOnly)]);

    await service.queueChunkExport(job);

    expect(auditLogStreamDAL.find).toHaveBeenCalledWith({ orgId: job.orgId }, { tx: primary });
    expect(queueService.queue).toHaveBeenCalledWith(
      QueueName.PamSessionActivityExport,
      QueueJobs.PamSessionActivityExport,
      job,
      expect.objectContaining({ jobId: `pam-session-activity-${session.id}-2` })
    );
  });

  test("queues nothing when no stream opted in, even one that receives every product", async () => {
    const { service, queueService } = buildService([stream("s1", null), stream("s2", { products: ["pam"] })]);

    await service.queueChunkExport(job);

    expect(queueService.queue).not.toHaveBeenCalled();
  });

  test("queues nothing when the instance turns off log streams or audit log generation", async () => {
    const { service, queueService } = buildService([stream("s1", withOutput)]);

    mockConfig.AUDIT_LOG_STREAMS_ENABLED = false;
    await service.queueChunkExport(job);
    mockConfig.AUDIT_LOG_STREAMS_ENABLED = true;
    mockConfig.DISABLE_AUDIT_LOG_GENERATION = true;
    await service.queueChunkExport(job);

    expect(queueService.queue).not.toHaveBeenCalled();
  });

  test("lets a queueing failure fail the upload, so the gateway re-sends the chunk", async () => {
    const { service, queueService } = buildService([stream("s1", commandsOnly)]);
    queueService.queue.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(service.queueChunkExport(job)).rejects.toThrow("redis unavailable");
  });

  test("sends each opted-in stream the events it asked for", async () => {
    const { runJob, enqueuedRows } = buildService([
      stream("with-output", withOutput),
      stream("commands-only", commandsOnly),
      stream("audit-logs-only", { products: ["pam"] })
    ]);

    await runJob(job);

    const [rows] = enqueuedRows();
    expect(rows.map((row) => row.stream.id)).toEqual(["with-output", "commands-only"]);
    expect(rows[0].payload.eventType).toBe(PamSessionActivityEventType.Query);
    expect(rows[0].payload.eventMetadata.output).toBe("hunter2");
    expect(rows[1].payload.eventMetadata).not.toHaveProperty("output");
  });

  test("reports an oversized chunk as skipped to every opted-in stream", async () => {
    const { runJob, enqueuedRows } = buildService([stream("commands-only", commandsOnly)], {
      chunk: { tooLarge: true }
    });

    await runJob(job);

    const [rows] = enqueuedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      eventType: PamSessionActivityEventType.Skipped,
      eventMetadata: { sessionId: session.id, chunkIndex: 2, reason: "chunk-too-large" }
    });
  });

  test("tells every opted-in stream about a chunk whose last export attempt failed", async () => {
    const { pamSessionChunkService, auditLogStreamOutboxService, runJob, enqueuedRows } = buildService([
      stream("commands-only", commandsOnly)
    ]);
    pamSessionChunkService.readChunkEvents.mockRejectedValue(new Error("storage unavailable"));

    await expect(runJob(job, 3)).rejects.toThrow("storage unavailable");
    expect(auditLogStreamOutboxService.enqueueStreamEvents).not.toHaveBeenCalled();

    await expect(runJob(job, 4)).rejects.toThrow("storage unavailable");
    const [rows] = enqueuedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      eventType: PamSessionActivityEventType.Skipped,
      eventMetadata: { sessionId: session.id, chunkIndex: 2, reason: "export-failed" }
    });
  });

  test("skips Windows sessions without reading their recording", async () => {
    const { pamSessionChunkService, auditLogStreamOutboxService, runJob } = buildService([stream("s1", withOutput)], {
      storedSession: { ...session, accountType: "windows", encryptedSessionKey: Buffer.from("key") }
    });

    await runJob(job);

    expect(pamSessionChunkService.readChunkEvents).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxService.enqueueStreamEvents).not.toHaveBeenCalled();
  });

  test("retries when the session's recording key isn't visible yet", async () => {
    const { runJob } = buildService([stream("s1", withOutput)], {
      storedSession: { ...session, encryptedSessionKey: null }
    });

    await expect(runJob(job)).rejects.toThrow(NotFoundError);
  });

  test("reads nothing when every stream opted out before the job ran", async () => {
    const { pamSessionChunkService, auditLogStreamOutboxService, runJob } = buildService([stream("s1", null)]);

    await runJob(job);

    expect(pamSessionChunkService.readChunkEvents).not.toHaveBeenCalled();
    expect(auditLogStreamOutboxService.enqueueStreamEvents).not.toHaveBeenCalled();
  });
});
