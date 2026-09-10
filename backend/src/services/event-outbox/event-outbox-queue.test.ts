import { QueueName } from "@app/queue";

import { eventOutboxQueueFactory } from "./event-outbox-queue";
import { TOutboxFlushKey } from "./event-outbox-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const config = {
  isGeneralWorkerRunModeEnabled: true,
  isSecondaryInstance: false,
  OTEL_TELEMETRY_COLLECTION_ENABLED: false
};

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => config
}));

beforeEach(() => {
  config.isGeneralWorkerRunModeEnabled = true;
  config.isSecondaryInstance = false;
});

const KEY: TOutboxFlushKey = { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" };

const buildQueue = (opts?: { keys?: TOutboxFlushKey[]; onDiscover?: () => Promise<void> }) => {
  const queued: { name: string; data: unknown; jobId?: string; attempts?: number }[] = [];
  const discoveredFor: string[][] = [];
  const registeredCrons: { name: string; enabled?: boolean }[] = [];
  let discoverCalls = 0;

  const factory = eventOutboxQueueFactory({
    queueService: {
      queue: async (name: string, _job: string, data: unknown, options: { jobId?: string; attempts?: number }) => {
        queued.push({ name, data, jobId: options.jobId, attempts: options.attempts });
      },
      start: () => {}
    } as never,
    cronJob: {
      register: (entry: { name: string; enabled?: boolean }) => {
        registeredCrons.push({ name: entry.name, enabled: entry.enabled });
      }
    } as never,
    eventOutboxRegistry: { names: () => ["alert", "audit"] },
    eventOutboxDAL: {
      findDueFlushKeys: async (_limit: number, consumers: string[]) => {
        discoverCalls += 1;
        discoveredFor.push(consumers);
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

  return { factory, queued, discoveredFor, registeredCrons, getDiscoverCalls: () => discoverCalls };
};

describe("event outbox relay", () => {
  test("discovers work only for the consumers registered in this process", async () => {
    const { factory, discoveredFor } = buildQueue();

    await factory.runRelayTick();

    expect(discoveredFor).toEqual([["alert", "audit"]]);
  });

  test("enqueues one flush job per discovered key", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY, { ...KEY, resourceId: "policy-2" }] });

    await factory.runRelayTick();

    expect(queued).toHaveLength(2);
    expect(queued[0].name).toBe(QueueName.EventOutboxFlush);
    expect(queued[0].data).toEqual(KEY);
  });

  // One flush per aggregate at a time is what keeps a resource's events in order, and it dedupes a
  // key the relay rediscovers while its flush is still queued.
  test("keys the job per aggregate so flushes for one resource cannot overlap", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY] });

    await factory.runRelayTick();

    expect(queued[0].jobId).toBe("outbox-flush-alert-approval.workflow-policy-1");
  });

  // BullMQ throws on a custom id containing ':', and under Promise.all that fails the whole tick, on
  // every tick, for as long as the row sits pending.
  test("encodes a resource id BullMQ would otherwise reject", async () => {
    const { factory, queued } = buildQueue({ keys: [{ ...KEY, resourceId: "arn:aws:iam::123:role/x" }] });

    await factory.runRelayTick();

    expect(queued[0].jobId).toBe("outbox-flush-alert-approval.workflow-arn%3Aaws%3Aiam%3A%3A123%3Arole%2Fx");
    expect(queued[0].jobId).not.toContain(":");
  });

  // Retry lives on the outbox row, where it's inspectable and survives a Redis flush. BullMQ retrying
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

  // Every other cron in the codebase sits behind this flag, and the docs promise a secondary region
  // runs no background jobs beyond audit logs.
  test("registers its crons disabled and never starts the relay on a secondary instance", async () => {
    vi.useFakeTimers();
    config.isSecondaryInstance = true;
    const { factory, registeredCrons, getDiscoverCalls } = buildQueue({ keys: [KEY] });

    factory.init();
    await vi.advanceTimersByTimeAsync(30_000);
    await factory.shutdown();
    vi.useRealTimers();

    expect(registeredCrons.map((cron) => cron.enabled)).toEqual([false, false]);
    expect(getDiscoverCalls()).toBe(0);
  });

  test("registers its crons enabled and starts the relay on a primary general worker", async () => {
    vi.useFakeTimers();
    const { factory, registeredCrons, getDiscoverCalls } = buildQueue({ keys: [KEY] });

    factory.init();
    await vi.advanceTimersByTimeAsync(30_000);
    await factory.shutdown();
    vi.useRealTimers();

    expect(registeredCrons.map((cron) => cron.enabled)).toEqual([true, true]);
    expect(getDiscoverCalls()).toBeGreaterThan(0);
  });

  test("stops cleanly when nothing was ever started", async () => {
    const { factory } = buildQueue();

    await expect(factory.shutdown()).resolves.toBeUndefined();
  });
});
