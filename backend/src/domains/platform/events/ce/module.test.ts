import { z } from "zod";

import { TDomainQueue } from "@app/domains/lib/jobs";
import { FakeQueue } from "@app/domains/lib/jobs/testing/fake-queue";

import { EventsModule } from "./module";

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

vi.mock("@app/lib/telemetry/metrics", () => ({
  resolveCoreMeter: () => ({ createObservableGauge: () => ({ addCallback: () => {} }) }),
  recordEventOutboxLagMetric: () => {},
  recordEventOutboxExhaustedMetric: () => {},
  recordEventOutboxRejectedMetric: () => {}
}));

// The module builds the Postgres store itself. Every query throws `queryError`, which is enough to tell whether
// the relay or a flush reached the database.
const buildModule = (flags: { isSecondaryInstance?: boolean; isGeneralWorkerRunModeEnabled?: boolean } = {}) => {
  const queryError = new Error("relation event_outbox does not exist");
  let queries = 0;
  const db = Object.assign(
    () => {
      queries += 1;
      throw queryError;
    },
    { replicaNode: () => db, fn: { now: () => "now" }, raw: () => "raw" }
  );
  const queue = new FakeQueue();
  const crons: { name: string; enabled?: boolean }[] = [];
  const module = new EventsModule({
    db: db as never,
    queueService: queue as unknown as TDomainQueue,
    cronJob: { register: (job) => crons.push({ name: job.name, enabled: job.enabled }) },
    isSecondaryInstance: flags.isSecondaryInstance ?? false,
    isGeneralWorkerRunModeEnabled: flags.isGeneralWorkerRunModeEnabled ?? true,
    isTelemetryEnabled: false
  });
  module.registerConsumer({
    name: "alert",
    dataSchema: z.object({}),
    subscribesTo: () => true,
    handle: async () => []
  });
  return { module, queue, crons, queryError, queries: () => queries };
};

describe("EventsModule.start", () => {
  beforeEach(() => {
    loggedErrors.length = 0;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("should register its crons enabled and start the relay on a primary general worker", async () => {
    // Setup
    const { module, crons, queries } = buildModule();

    // Action
    module.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await module.stop();

    // Assert
    expect(crons).toEqual([
      { name: "event-outbox-stale-claim-sweeper", enabled: true },
      { name: "event-outbox-cleanup", enabled: true }
    ]);
    expect(queries()).toBeGreaterThan(0);
  });

  // Every other cron sits behind this flag, and the docs promise a secondary region only runs audit log jobs.
  test("should register its crons disabled and never start the relay on a secondary instance", async () => {
    // Setup
    const { module, crons, queries } = buildModule({ isSecondaryInstance: true });

    // Action
    module.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await module.stop();

    // Assert
    expect(crons.map((cron) => cron.enabled)).toEqual([false, false]);
    expect(queries()).toBe(0);
  });

  test("should not start the relay outside the general worker run mode", async () => {
    // Setup
    const { module, crons, queries } = buildModule({ isGeneralWorkerRunModeEnabled: false });

    // Action
    module.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await module.stop();

    // Assert
    expect(crons.map((cron) => cron.enabled)).toEqual([true, true]);
    expect(queries()).toBe(0);
  });

  test("should stop the relay", async () => {
    // Setup
    const { module, queries } = buildModule();
    module.start();
    await vi.advanceTimersByTimeAsync(30_000);
    await module.stop();
    const before = queries();

    // Action
    await vi.advanceTimersByTimeAsync(60_000);

    // Assert
    expect(queries()).toBe(before);
  });

  // The flush job is removeOnFail with one attempt, so the log is the only trace of a crashed drain.
  test("should log and rethrow when a flush crashes", async () => {
    // Setup
    const { module, queue, queryError } = buildModule({ isGeneralWorkerRunModeEnabled: false });
    module.start();
    const flush = [...queue.handlers.values()][0];

    // Action
    const result = flush({ data: { consumer: "alert" } });

    // Assert
    await expect(result).rejects.toMatchObject({ error: queryError });
    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0][1]).toContain("consumer=alert");
  });

  test("should refuse a consumer registered after it started", () => {
    // Setup
    const { module } = buildModule({ isGeneralWorkerRunModeEnabled: false });
    module.start();

    // Action
    const register = () =>
      module.registerConsumer({
        name: "late",
        dataSchema: z.object({}),
        subscribesTo: () => true,
        handle: async () => []
      });

    // Assert
    expect(register).toThrow("was registered after the events module started");
  });
});

describe("EventsModule.stop", () => {
  test("should resolve when nothing was ever started", async () => {
    // Setup
    const { module } = buildModule();

    // Action
    const result = module.stop();

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});
