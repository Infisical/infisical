import { randomUUID } from "node:crypto";

import { Job, Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";

import { initLogger } from "@app/lib/logger";
import { secretSyncQueueFactory } from "@app/services/secret-sync/secret-sync-queue";

// Against the real Redis the e2e environment boots, because what is under test is BullMQ's own
// deduplication: which triggers it drops, which one it keeps while a job is active, and the delay and
// data the kept job runs with. The unit tests mock the queue service and only see the options passed.
declare const testRedis: Redis;

type TSeenJob = { failedToAcquireLockCount?: number; delay?: number };

const SYNC_ID = "sync-1";

const waitFor = async (check: () => boolean | Promise<boolean>, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-await-in-loop
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the queue");
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
};

// Runs the real secret sync queue on a queue of its own, so the test server's secret sync worker never
// picks these jobs up. findById blocks until the test releases it, which holds the job active, and then
// returns nothing so the handler skips the sync without touching the database or a provider.
const createHarness = () => {
  const connection = testRedis.duplicate({ maxRetriesPerRequest: null });
  const queueName = `secret-sync-dedup-e2e-${randomUUID()}`;
  const bullQueue = new Queue(queueName, { connection });
  const seen: TSeenJob[] = [];
  const control = { lockFails: false, release: () => {}, held: Promise.resolve() };
  let worker: Worker | undefined;

  const hold = () => {
    control.held = new Promise<void>((resolve) => {
      control.release = resolve;
    });
  };

  const queue = secretSyncQueueFactory({
    queueService: {
      start: (_name: string, fn: (job: Job) => Promise<void>) => {
        worker = new Worker(queueName, fn, { connection });
        worker.on("active", (job: Job) => {
          seen.push({ failedToAcquireLockCount: job.data.failedToAcquireLockCount, delay: job.opts.delay });
        });
      },
      queue: (_name: string, job: string, data: unknown, opts: Record<string, unknown>) =>
        bullQueue.add(job, data, { removeOnComplete: true, removeOnFail: true, ...opts })
    },
    secretSyncDAL: {
      findConnectionId: async () => "connection-1",
      findById: async () => {
        await control.held;
        return undefined;
      }
    },
    keyStore: {
      acquireLock: async () => {
        if (control.lockFails) throw new Error("locked");
        return { release: async () => undefined };
      },
      incrementByAndRefreshExpiryIfUnderLimit: async () => 1,
      decrementByOrDelete: async () => 0
    }
  } as never);

  const pending = () => bullQueue.getJobs(["waiting", "delayed", "prioritized"]);
  const trigger = (times: number) =>
    Promise.all(Array.from({ length: times }, () => queue.queueSecretSyncSyncSecretsById({ syncId: SYNC_ID })));
  // A first trigger waits up to 10 s of jitter and a requeue 30 s more, so run them now.
  const promote = () => bullQueue.promoteJobs();
  const idle = async () => (await bullQueue.getJobCountByTypes("active", "waiting", "delayed", "prioritized")) === 0;

  const close = async () => {
    control.release();
    await worker?.close();
    await bullQueue.obliterate({ force: true });
    await bullQueue.close();
    connection.disconnect();
  };

  return { seen, control, hold, trigger, promote, pending, idle, close };
};

let harness: ReturnType<typeof createHarness>;

beforeAll(() => {
  initLogger();
});

beforeEach(() => {
  harness = createHarness();
});

afterEach(async () => {
  await harness.close();
});

describe("secret sync job deduplication (redis)", { timeout: 60_000 }, () => {
  test("many triggers while a sync runs produce one follow-up run, and a later trigger runs again", async () => {
    const { seen, hold, control, trigger, promote, pending, idle } = harness;

    hold();
    await trigger(1);
    await promote();
    await waitFor(() => seen.length === 1);

    await trigger(50);
    control.release();
    await waitFor(async () => (await pending()).length === 1);

    await trigger(50);
    expect(await pending()).toHaveLength(1);

    await promote();
    await waitFor(idle);
    expect(seen).toHaveLength(2);

    await trigger(1);
    await promote();
    await waitFor(() => seen.length === 3);
    await waitFor(idle);
    expect(seen).toHaveLength(3);
  });

  test("a lock-failure requeue keeps its count and delay when more triggers arrive", async () => {
    const { seen, control, trigger, promote, pending, idle } = harness;

    control.lockFails = true;
    await trigger(1);
    await promote();
    await waitFor(async () => seen.length === 1 && (await pending()).length === 1);

    await trigger(20);
    const requeued = await pending();
    expect(requeued).toHaveLength(1);
    expect(requeued[0].data).toEqual({ syncId: SYNC_ID, failedToAcquireLockCount: 1 });
    expect(requeued[0].opts.delay).toBeGreaterThanOrEqual(30_000);

    control.lockFails = false;
    await promote();
    await waitFor(idle);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toEqual({ failedToAcquireLockCount: 1, delay: requeued[0].opts.delay });
  });
});
