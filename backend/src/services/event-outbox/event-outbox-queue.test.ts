import { QueueName } from "@app/queue";

import { eventOutboxQueueFactory } from "./event-outbox-queue";
import { TOutboxFlushKey } from "./event-outbox-types";

const loggedErrors: unknown[][] = [];

vi.mock("@app/lib/logger", () => ({
  logger: {
    info: () => {},
    warn: () => {},
    error: (...args: unknown[]) => {
      loggedErrors.push(args);
    },
    debug: () => {}
  },
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
  loggedErrors.length = 0;
});

const KEY: TOutboxFlushKey = { consumer: "alert" };

type TFlushHandler = (job: { data: TOutboxFlushKey }) => Promise<void>;

const buildQueue = (opts?: {
  keys?: TOutboxFlushKey[];
  onDiscover?: () => Promise<void>;
  drain?: (key: TOutboxFlushKey) => Promise<unknown>;
}) => {
  const queued: { name: string; data: unknown; jobId?: string; attempts?: number }[] = [];
  const discoveredFor: string[][] = [];
  const registeredCrons: { name: string; enabled?: boolean }[] = [];
  let flushHandler: TFlushHandler | undefined;
  let discoverCalls = 0;

  const factory = eventOutboxQueueFactory({
    queueService: {
      queue: async (name: string, _job: string, data: unknown, options: { jobId?: string; attempts?: number }) => {
        queued.push({ name, data, jobId: options.jobId, attempts: options.attempts });
      },
      start: (_name: string, handler: TFlushHandler) => {
        flushHandler = handler;
      }
    } as never,
    cronJob: {
      register: (entry: { name: string; enabled?: boolean }) => {
        registeredCrons.push({ name: entry.name, enabled: entry.enabled });
      }
    } as never,
    eventOutboxRegistry: { names: () => ["alert", "audit"] },
    eventOutboxDAL: {
      findDueFlushKeys: async (consumers: string[]) => {
        discoverCalls += 1;
        discoveredFor.push(consumers);
        if (opts?.onDiscover) await opts.onDiscover();
        return opts?.keys ?? [];
      },
      findOldestPendingAgeSeconds: async () => []
    } as never,
    eventOutboxService: {
      drain: opts?.drain ?? (async () => ({ handled: 0, unknownConsumer: false })),
      sweepStaleClaims: async () => {},
      pruneTerminalRows: async () => {}
    } as never
  });

  return {
    factory,
    queued,
    discoveredFor,
    registeredCrons,
    getDiscoverCalls: () => discoverCalls,
    getFlushHandler: () => flushHandler as TFlushHandler
  };
};

describe("event outbox relay", () => {
  test("discovers work only for the consumers registered in this process", async () => {
    const { factory, discoveredFor } = buildQueue();

    await factory.runRelayTick();

    expect(discoveredFor).toEqual([["alert", "audit"]]);
  });

  test("enqueues one flush job per consumer with due work", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY, { consumer: "audit" }] });

    await factory.runRelayTick();

    expect(queued).toHaveLength(2);
    expect(queued[0].name).toBe(QueueName.EventOutboxFlush);
    expect(queued[0].data).toEqual(KEY);
  });

  // One flush per consumer at a time keeps drain's batches serial and dedupes a consumer the relay
  // rediscovers while its flush is still queued.
  test("keys the job per consumer so two flushes for one consumer cannot overlap", async () => {
    const { factory, queued } = buildQueue({ keys: [KEY] });

    await factory.runRelayTick();

    expect(queued[0].jobId).toBe("outbox-flush-alert");
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

  // Every other cron sits behind this flag, and the docs promise a secondary region runs no
  // background jobs beyond audit logs.
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

  // The flush job is removeOnFail with one attempt, so without the log a crashed drain leaves nothing
  // but a counter behind.
  test("logs and rethrows when a flush crashes so the failure is visible", async () => {
    const boom = new Error("claimBatch: relation does not exist");
    const { factory, getFlushHandler } = buildQueue({
      drain: async () => {
        throw boom;
      }
    });
    factory.init();

    await expect(getFlushHandler()({ data: KEY })).rejects.toBe(boom);

    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0][0]).toBe(boom);
    expect(loggedErrors[0][1]).toContain("consumer=alert");
  });

  test("stops cleanly when nothing was ever started", async () => {
    const { factory } = buildQueue();

    await expect(factory.shutdown()).resolves.toBeUndefined();
  });
});
