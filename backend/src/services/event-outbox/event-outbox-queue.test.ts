import { QueueName } from "@app/queue";

import { eventOutboxQueueFactory } from "./event-outbox-queue";
import { TOutboxFlushKey } from "./event-outbox-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isGeneralWorkerRunModeEnabled: true, OTEL_TELEMETRY_COLLECTION_ENABLED: false })
}));

const KEY: TOutboxFlushKey = { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" };

const buildQueue = (opts?: { keys?: TOutboxFlushKey[]; onDiscover?: () => Promise<void> }) => {
  const queued: { name: string; data: unknown; jobId?: string; attempts?: number }[] = [];
  let discoverCalls = 0;

  const factory = eventOutboxQueueFactory({
    queueService: {
      queue: async (name: string, _job: string, data: unknown, options: { jobId?: string; attempts?: number }) => {
        queued.push({ name, data, jobId: options.jobId, attempts: options.attempts });
      },
      start: () => {}
    } as never,
    cronJob: { register: () => {} } as never,
    eventOutboxDAL: {
      findDueFlushKeys: async () => {
        discoverCalls += 1;
        if (opts?.onDiscover) await opts.onDiscover();
        return opts?.keys ?? [];
      },
      findOldestPendingAgeSeconds: async () => []
    } as never,
    eventOutboxService: {
      drain: async () => ({ handled: 0, exhaustedConsumer: false }),
      sweepStaleClaims: async () => {},
      pruneTerminalRows: async () => {}
    } as never
  });

  return { factory, queued, getDiscoverCalls: () => discoverCalls };
};

describe("event outbox relay", () => {
  test("enqueues one flush job per discovered key", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY, { ...KEY, resourceId: "policy-2" }] });

    await factory.runRelayTick();

    expect(queued).toHaveLength(2);
    expect(queued[0].name).toBe(QueueName.EventOutboxFlush);
    expect(queued[0].data).toEqual(KEY);
  });

  // One flush per aggregate at a time is what keeps a resource's events in order, and it dedupes the
  // relay rediscovering a key whose flush is still queued.
  test("keys the job per aggregate so flushes for one resource cannot overlap", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY] });

    await factory.runRelayTick();

    expect(queued[0].jobId).toBe("outbox-flush-alert-approval.workflow-policy-1");
  });

  // BullMQ throws on a custom id containing ':'; with Promise.all that would fail the whole tick, every
  // tick, for as long as the row sat pending. Encoding keeps the id both legal and collision-free.
  test("encodes a resource id BullMQ would otherwise reject", async () => {
    const { factory, queued } = buildQueue({ keys: [{ ...KEY, resourceId: "arn:aws:iam::123:role/x" }] });

    await factory.runRelayTick();

    expect(queued[0].jobId).toBe("outbox-flush-alert-approval.workflow-arn%3Aaws%3Aiam%3A%3A123%3Arole%2Fx");
    expect(queued[0].jobId).not.toContain(":");
  });

  // Retry lives on the outbox row, where it is inspectable and survives a Redis flush. BullMQ retrying
  // the job would re-run drain against rows already flipped to 'processing'.
  test("does not ask BullMQ to retry a flush", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY] });

    await factory.runRelayTick();

    expect(queued[0].attempts).toBe(1);
  });

  test("enqueues nothing when there is no due work", async () => {
    const { factory, queued } = buildQueue({ keys: [] });

    await factory.runRelayTick();

    expect(queued).toHaveLength(0);
  });

  test("stops cleanly when nothing was ever started", async () => {
    const { factory } = buildQueue();

    await expect(factory.shutdown()).resolves.toBeUndefined();
  });
});
