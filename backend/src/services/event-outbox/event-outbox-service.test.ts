import { z } from "zod";

import { TEventOutbox } from "@app/db/schemas";

import { eventOutboxRegistryFactory } from "./event-outbox-registry";
import { eventOutboxServiceFactory } from "./event-outbox-service";
import {
  EventOutboxStatus,
  EventResultStatus,
  IEventConsumer,
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_PAYLOAD_BYTES,
  TEventInput
} from "./event-outbox-types";

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: loggerWarn, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const { exhaustedMetrics } = vi.hoisted(() => ({ exhaustedMetrics: [] as { consumer: string; count: number }[] }));
vi.mock("@app/lib/telemetry/metrics", () => ({
  recordEventOutboxLagMetric: () => {},
  recordEventOutboxExhaustedMetric: (params: { consumer: string; count: number }) => {
    exhaustedMetrics.push(params);
  }
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const makePayload = (overrides?: Record<string, unknown>) => ({
  orgId: ORG_ID,
  resourceType: "approval.workflow",
  resourceId: "policy-1",
  targetIds: ["req-1"],
  ...overrides
});

const makeEvent = (overrides?: Partial<TEventInput>): TEventInput => ({
  eventType: "approval.workflow.request_opened",
  payload: makePayload(),
  ...overrides
});

const makeConsumer = (overrides?: Partial<IEventConsumer>): IEventConsumer =>
  ({
    name: "alert",
    payloadSchema: z.object({ targetIds: z.array(z.string()).min(1) }),
    subscribesTo: (eventType: string) => eventType === "approval.workflow.request_opened",
    handle: async () => [],
    ...overrides
  }) as IEventConsumer;

// Sentinel: emit has to pass the caller's tx through untouched. Silently opening a second connection
// is how the pool deadlocks.
const TX = { sentinel: true } as never;

const buildService = (consumers: IEventConsumer[]) => {
  const registry = eventOutboxRegistryFactory();
  consumers.forEach((consumer) => registry.register(consumer));

  const inserted: { rows: unknown[]; tx: unknown }[] = [];
  const service = eventOutboxServiceFactory({
    eventOutboxDAL: {
      insertEvents: async (rows: unknown[], tx: unknown) => {
        inserted.push({ rows, tx });
      }
    } as never,
    eventOutboxRegistry: registry
  });

  return { service, inserted, insertedRows: () => inserted.flatMap((call) => call.rows) };
};

describe("event outbox emit", () => {
  test("writes one row per subscribing consumer and none for a non-subscriber", async () => {
    const { service, insertedRows } = buildService([
      makeConsumer({ name: "alert" }),
      makeConsumer({ name: "other", subscribesTo: () => false })
    ]);

    await service.emit(makeEvent(), TX);

    expect(insertedRows()).toHaveLength(1);
    expect((insertedRows()[0] as { consumer: string }).consumer).toBe("alert");
  });

  test("does not touch the database when no consumer handles the event type", async () => {
    const { service, inserted } = buildService([makeConsumer({ subscribesTo: () => false })]);

    await service.emit(makeEvent(), TX);

    expect(inserted).toHaveLength(0);
  });

  // The insert is the only statement emit adds to the caller's transaction. If a consumer callback
  // ever reappears here, this is what fails.
  test("writes a row without consulting the database about the resource", async () => {
    const { service, inserted } = buildService([makeConsumer()]);

    await service.emit(makeEvent(), TX);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].tx).toBe(TX);
  });

  // An unreadable payload means a wrong emit site. Failing loudly beats dropping a notification over a
  // misspelled field.
  test("throws when the payload does not match the consumer's schema", async () => {
    const { service, inserted } = buildService([makeConsumer()]);

    await expect(service.emit(makeEvent({ payload: makePayload({ targetIds: [] }) }), TX)).rejects.toThrow(
      "the 'alert' consumer cannot accept"
    );
    expect(inserted).toHaveLength(0);
  });

  test("throws on an oversized payload rather than storing a document", async () => {
    const { service, inserted } = buildService([
      makeConsumer({ payloadSchema: z.object({ blob: z.string() }) as never })
    ]);

    await expect(service.emit(makeEvent({ payload: { blob: "x".repeat(20_000) } }), TX)).rejects.toThrow(
      `over the ${MAX_OUTBOX_PAYLOAD_BYTES} byte limit`
    );
    expect(inserted).toHaveLength(0);
  });

  test("throws on a malformed event envelope", async () => {
    const { service } = buildService([makeConsumer()]);

    await expect(service.emit(makeEvent({ eventType: "Not A Key" }), TX)).rejects.toThrow("Invalid outbox event");
  });

  // Swallowing it would hand the caller a poisoned transaction instead of the real error.
  test("propagates a failing insert rather than swallowing it", async () => {
    const registry = eventOutboxRegistryFactory();
    registry.register(makeConsumer());
    const service = eventOutboxServiceFactory({
      eventOutboxDAL: {
        insertEvents: async () => {
          throw new Error("connection terminated");
        }
      } as never,
      eventOutboxRegistry: registry
    });

    await expect(service.emit(makeEvent(), TX)).rejects.toThrow("connection terminated");
  });
});

describe("event outbox drain", () => {
  const makeRow = (overrides?: Partial<TEventOutbox>): TEventOutbox =>
    ({
      id: 1,
      consumer: "alert",
      eventType: "approval.workflow.request_opened",
      payload: makePayload(),
      idempotencyKey: null,
      occurredAt: new Date(),
      status: EventOutboxStatus.Processing,
      attempts: 0,
      nextRetryAt: new Date(),
      lockedAt: new Date(),
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    }) as TEventOutbox;

  const buildDrain = (opts: {
    batches: TEventOutbox[][];
    handle: IEventConsumer["handle"];
    consumerName?: string;
    settled?: (input: { delivered: { ids: string[] }[] }) => number;
  }) => {
    const registry = eventOutboxRegistryFactory();
    registry.register(makeConsumer({ name: opts.consumerName ?? "alert", handle: opts.handle }));

    const commits: {
      delivered: { ids: string[] }[];
      retriable: { ids: string[]; nextRetryDelayMs: number; error?: string }[];
      failed: { ids: string[]; error?: string }[];
    }[] = [];
    const extended: { ids: string[]; lockToken: string }[] = [];
    const claimTokens: string[] = [];
    let batchIdx = 0;

    const service = eventOutboxServiceFactory({
      eventOutboxDAL: {
        claimBatch: async () => {
          const rows = opts.batches[batchIdx] ?? [];
          batchIdx += 1;
          const lockToken = `token-${batchIdx}`;
          claimTokens.push(lockToken);
          return { lockToken, rows };
        },
        extendClaims: async (ids: string[], lockToken: string) => {
          extended.push({ ids, lockToken });
        },
        commitResults: async (input: never) => {
          commits.push(input);
          const counted = input as unknown as {
            delivered: { ids: string[] }[];
            retriable: { ids: string[] }[];
            failed: { ids: string[] }[];
          };
          if (opts.settled) return opts.settled(counted);
          return [...counted.delivered, ...counted.retriable, ...counted.failed].reduce(
            (n, group) => n + group.ids.length,
            0
          );
        }
      } as never,
      eventOutboxRegistry: registry
    });

    return { service, commits, extended, claimTokens };
  };

  const KEY = { consumer: "alert" };

  test("commits a delivered result and stops when a claim comes back empty", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow()]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered }))
    });

    const result = await service.drain(KEY);

    expect(result.handled).toBe(1);
    expect(commits[0].delivered).toEqual([{ ids: ["1"] }]);
  });

  test("retries the whole batch when the consumer throws", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow()]],
      handle: async () => {
        throw new Error("provider exploded");
      }
    });

    await service.drain(KEY);

    expect(commits[0].retriable[0].ids).toEqual(["1"]);
    expect(commits[0].delivered).toEqual([]);
  });

  // Otherwise rows the consumer forgot would sit in 'processing' until the sweeper noticed, looking
  // exactly like a crashed worker.
  test("retries a row the consumer returned no result for", async () => {
    const { service, commits } = buildDrain({ batches: [[makeRow()]], handle: async () => [] });

    await service.drain(KEY);

    expect(commits[0].retriable[0].ids).toEqual(["1"]);
  });

  test("fails a row terminally once it has used up its attempts", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow({ attempts: MAX_OUTBOX_ATTEMPTS - 1 })]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Retry })),
      consumerName: "alert"
    });

    await service.drain(KEY);

    expect(commits[0].failed[0].ids).toEqual(["1"]);
    expect(commits[0].retriable).toEqual([]);
  });

  // One UPDATE per distinct outcome, so a hundred deliveries is one statement. Rows on the same attempt
  // share a retry delay, so they group too.
  test("groups rows that share an outcome into one commit entry", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow({ id: 1 }), makeRow({ id: 2 }), makeRow({ id: 3 }), makeRow({ id: 4 })]],
      handle: async (rows) =>
        rows.map((row) =>
          Number(row.id) <= 2
            ? { id: String(row.id), status: EventResultStatus.Delivered }
            : { id: String(row.id), status: EventResultStatus.Retry, error: "slack 502" }
        )
    });

    await service.drain(KEY);

    expect(commits[0].delivered).toEqual([{ ids: ["1", "2"] }]);
    expect(commits[0].retriable).toHaveLength(1);
    expect(commits[0].retriable[0].ids).toEqual(["3", "4"]);
    expect(commits[0].retriable[0].error).toBe("slack 502");
  });

  // commitResults fences on the claim token. Reporting under a different one would write to whatever
  // worker holds the rows now.
  test("commits under the token the batch was claimed with", async () => {
    const { service, commits, claimTokens } = buildDrain({
      batches: [[makeRow()]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered }))
    });

    await service.drain(KEY);

    expect((commits[0] as unknown as { lockToken: string }).lockToken).toBe(claimTokens[0]);
  });

  // A short settle means the sweeper handed the rows to another worker mid-delivery, so the batch went
  // out twice. This log is the only place that shows up.
  test("reports a claim that was taken away mid-delivery", async () => {
    loggerWarn.mockClear();
    const { service } = buildDrain({
      batches: [[makeRow({ id: 1 }), makeRow({ id: 2 })]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered })),
      settled: () => 1
    });

    await service.drain(KEY);

    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn.mock.calls[0][0]).toContain("settled 1 of 2 row(s)");
  });

  test("says nothing when every claimed row settles", async () => {
    loggerWarn.mockClear();
    const { service } = buildDrain({
      batches: [[makeRow()]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered }))
    });

    await service.drain(KEY);

    expect(loggerWarn).not.toHaveBeenCalled();
  });

  // A slow batch (slow webhook, many rows) has to keep its claim fresh or the sweeper hands it to a
  // second worker mid-delivery.
  test("extends the claim while the consumer is still handling a batch", async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const { service, extended, claimTokens } = buildDrain({
        batches: [[makeRow({ id: 1 }), makeRow({ id: 2 })]],
        handle: (rows) =>
          new Promise((resolve) => {
            release = () => resolve(rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered })));
          })
      });

      const draining = service.drain(KEY);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(extended.length).toBeGreaterThanOrEqual(3);
      expect(extended[0]).toEqual({ ids: ["1", "2"], lockToken: claimTokens[0] });

      release();
      await draining;

      const afterRelease = extended.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(extended.length).toBe(afterRelease);
    } finally {
      vi.useRealTimers();
    }
  });

  // Without this, a handle() that never settles keeps the heartbeat alive forever and, because the
  // flush job id is per consumer, blocks every later flush for that consumer until a restart.
  test("gives up on a consumer that never settles and retries the batch", async () => {
    vi.useFakeTimers();
    try {
      const { service, commits, extended } = buildDrain({
        batches: [[makeRow({ id: 1 }), makeRow({ id: 2 })]],
        handle: () => new Promise(() => {})
      });

      const draining = service.drain(KEY);
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      await expect(draining).resolves.toEqual({ handled: 2, unknownConsumer: false });

      expect(commits).toHaveLength(1);
      expect(commits[0].delivered).toEqual([]);
      expect(commits[0].retriable).toHaveLength(1);
      expect(commits[0].retriable[0].ids).toEqual(["1", "2"]);
      expect(commits[0].retriable[0].error).toContain("did not finish handling the batch");

      const afterTimeout = extended.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(extended.length).toBe(afterTimeout);
    } finally {
      vi.useRealTimers();
    }
  });

  test("leaves rows untouched when no consumer is registered under the key", async () => {
    const { service, commits } = buildDrain({ batches: [[makeRow()]], handle: async () => [] });

    const result = await service.drain({ consumer: "gone" });

    expect(result.unknownConsumer).toBe(true);
    expect(commits).toHaveLength(0);
  });

  // The consumer already sent by now. Letting a transient commit failure escape would leave the rows
  // to the sweeper and re-notify ten minutes later.
  test("retries a failed commit before giving up on it", async () => {
    vi.useFakeTimers();
    try {
      const registry = eventOutboxRegistryFactory();
      registry.register(
        makeConsumer({
          name: "alert",
          handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered }))
        })
      );
      let commitCalls = 0;
      let batchServed = false;
      const service = eventOutboxServiceFactory({
        eventOutboxDAL: {
          claimBatch: async () => {
            if (batchServed) return { lockToken: "token-1", rows: [] };
            batchServed = true;
            return { lockToken: "token-1", rows: [makeRow()] };
          },
          extendClaims: async () => {},
          commitResults: async () => {
            commitCalls += 1;
            if (commitCalls === 1) throw new Error("connection reset");
            return 1;
          }
        } as never,
        eventOutboxRegistry: registry
      });

      const draining = service.drain(KEY);
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(draining).resolves.toEqual({ handled: 1, unknownConsumer: false });
      expect(commitCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("gives up on a commit that keeps failing so the sweeper can take over", async () => {
    vi.useFakeTimers();
    try {
      const registry = eventOutboxRegistryFactory();
      registry.register(
        makeConsumer({
          name: "alert",
          handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventResultStatus.Delivered }))
        })
      );
      let commitCalls = 0;
      const service = eventOutboxServiceFactory({
        eventOutboxDAL: {
          claimBatch: async () => ({ lockToken: "token-1", rows: [makeRow()] }),
          extendClaims: async () => {},
          commitResults: async () => {
            commitCalls += 1;
            throw new Error("connection reset");
          }
        } as never,
        eventOutboxRegistry: registry
      });

      const draining = service.drain(KEY);
      // Attach the handler before advancing so the rejection has a listener when the retries run out.
      const outcome = expect(draining).rejects.toThrow("connection reset");
      await vi.advanceTimersByTimeAsync(5_000);
      await outcome;
      expect(commitCalls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("event outbox stale sweep", () => {
  const buildSweep = (batches: { retried: number; failed: { consumer: string; count: number }[] }[]) => {
    const calls: { limit: number }[] = [];
    const service = eventOutboxServiceFactory({
      eventOutboxDAL: {
        recoverStaleClaims: async (input: { limit: number }) => {
          calls.push(input);
          return batches[calls.length - 1] ?? { retried: 0, failed: [] };
        }
      } as never,
      eventOutboxRegistry: eventOutboxRegistryFactory()
    });
    return { service, calls };
  };

  beforeEach(() => {
    exhaustedMetrics.length = 0;
  });

  // A row the sweeper gives up on is just as lost as one a consumer gives up on, and the exhausted
  // metric promises to count every one.
  test("counts events the sweeper gives up on, per consumer, on the exhausted metric", async () => {
    const { service } = buildSweep([
      {
        retried: 3,
        failed: [
          { consumer: "alert", count: 2 },
          { consumer: "audit", count: 1 }
        ]
      }
    ]);

    await service.sweepStaleClaims();

    expect(exhaustedMetrics).toEqual([
      { consumer: "alert", count: 2 },
      { consumer: "audit", count: 1 }
    ]);
  });

  test("records nothing when the sweep found no stale claims", async () => {
    const { service, calls } = buildSweep([]);

    await service.sweepStaleClaims();

    expect(calls).toHaveLength(1);
    expect(exhaustedMetrics).toEqual([]);
  });

  test("keeps sweeping while batches come back full, and stops at a bound", async () => {
    const { service, calls } = buildSweep(
      Array.from({ length: 50 }, () => ({ retried: 1_000, failed: [] as { consumer: string; count: number }[] }))
    );

    await service.sweepStaleClaims();

    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.limit === 1_000)).toBe(true);
  });

  test("stops after the first batch that comes back short", async () => {
    const { service, calls } = buildSweep([
      { retried: 1_000, failed: [] },
      { retried: 998, failed: [{ consumer: "alert", count: 1 }] },
      { retried: 1_000, failed: [] }
    ]);

    await service.sweepStaleClaims();

    expect(calls).toHaveLength(2);
  });
});
