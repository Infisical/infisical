import { z } from "zod";

import { eventOutboxRegistryFactory } from "./event-outbox-registry";
import { eventOutboxServiceFactory } from "./event-outbox-service";
import {
  EventOutboxStatus,
  IEventOutboxConsumer,
  MAX_OUTBOX_ATTEMPTS,
  TEventOutboxRow,
  TOutboxEvent
} from "./event-outbox-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const makeEvent = (overrides?: Partial<TOutboxEvent>): TOutboxEvent => ({
  eventType: "approval.workflow.request_opened",
  resourceType: "approval.workflow",
  resourceId: "policy-1",
  orgId: ORG_ID,
  payload: { targetIds: ["req-1"] },
  ...overrides
});

const makeConsumer = (overrides?: Partial<IEventOutboxConsumer>): IEventOutboxConsumer =>
  ({
    name: "alert",
    payloadSchema: z.object({ targetIds: z.array(z.string()).min(1) }),
    subscribesTo: (eventType: string) => eventType === "approval.workflow.request_opened",
    handle: async () => [],
    ...overrides
  }) as IEventOutboxConsumer;

// `tx` is a sentinel: emit has to thread the caller's transaction through untouched, since a call
// that silently opens its own connection is how the pool deadlocks.
const TX = { sentinel: true } as never;

const buildService = (consumers: IEventOutboxConsumer[]) => {
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

  // A payload the consumer can't read means a statically wrong emit site, and failing loudly beats
  // dropping a notification over a misspelled field.
  test("throws when the payload does not match the consumer's schema", async () => {
    const { service, inserted } = buildService([makeConsumer()]);

    await expect(service.emit(makeEvent({ payload: { targetIds: [] } }), TX)).rejects.toThrow(
      /the 'alert' consumer cannot accept/
    );
    expect(inserted).toHaveLength(0);
  });

  test("throws on an oversized payload rather than storing a document", async () => {
    const { service, inserted } = buildService([
      makeConsumer({ payloadSchema: z.object({ blob: z.string() }) as never })
    ]);

    await expect(service.emit(makeEvent({ payload: { blob: "x".repeat(20_000) } }), TX)).rejects.toThrow(
      /over the .* byte limit/
    );
    expect(inserted).toHaveLength(0);
  });

  test("throws on a malformed event envelope", async () => {
    const { service } = buildService([makeConsumer()]);

    await expect(service.emit(makeEvent({ orgId: "not-a-uuid" }), TX)).rejects.toThrow(/Invalid outbox event/);
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
  const makeRow = (overrides?: Partial<TEventOutboxRow>): TEventOutboxRow =>
    ({
      id: 1,
      consumer: "alert",
      eventType: "approval.workflow.request_opened",
      resourceType: "approval.workflow",
      resourceId: "policy-1",
      orgId: ORG_ID,
      projectId: null,
      payload: { targetIds: ["req-1"] },
      idempotencyKey: null,
      occurredAt: new Date(),
      status: EventOutboxStatus.Processing,
      attempts: 0,
      nextRetryAt: new Date(),
      lockedAt: new Date(),
      progress: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides
    }) as TEventOutboxRow;

  const buildDrain = (opts: {
    batches: TEventOutboxRow[][];
    handle: IEventOutboxConsumer["handle"];
    consumerName?: string;
  }) => {
    const registry = eventOutboxRegistryFactory();
    registry.register(makeConsumer({ name: opts.consumerName ?? "alert", handle: opts.handle }));

    const commits: {
      delivered: { ids: string[]; progress?: unknown }[];
      retriable: { ids: string[]; nextRetryDelayMs: number; error?: string }[];
      failed: { ids: string[]; error?: string }[];
    }[] = [];
    const extended: string[][] = [];
    let batchIdx = 0;

    const service = eventOutboxServiceFactory({
      eventOutboxDAL: {
        claimBatch: async () => {
          const batch = opts.batches[batchIdx] ?? [];
          batchIdx += 1;
          return batch;
        },
        extendClaims: async (ids: string[]) => {
          extended.push(ids);
        },
        commitResults: async (input: never) => {
          commits.push(input);
        }
      } as never,
      eventOutboxRegistry: registry
    });

    return { service, commits, extended };
  };

  const KEY = { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" };

  test("commits a delivered result and stops when a claim comes back empty", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow()]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Delivered }))
    });

    const result = await service.drain({
      consumer: "alert",
      resourceType: "approval.workflow",
      resourceId: "policy-1"
    });

    expect(result.handled).toBe(1);
    expect(commits[0].delivered).toEqual([{ ids: ["1"], progress: undefined }]);
  });

  // A consumer that throws must not lose the batch: every row goes back for another attempt.
  test("retries the whole batch when the consumer throws", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow()]],
      handle: async () => {
        throw new Error("provider exploded");
      }
    });

    await service.drain({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" });

    expect(commits[0].retriable[0].ids).toEqual(["1"]);
    expect(commits[0].delivered).toEqual([]);
  });

  // Otherwise a consumer that quietly returns nothing would leave rows stuck in 'processing' until
  // the stale-claim sweeper noticed, which looks identical to a crashed worker.
  test("retries a row the consumer returned no result for", async () => {
    const { service, commits } = buildDrain({ batches: [[makeRow()]], handle: async () => [] });

    await service.drain({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" });

    expect(commits[0].retriable[0].ids).toEqual(["1"]);
  });

  test("fails a row terminally once it has used up its attempts", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow({ attempts: MAX_OUTBOX_ATTEMPTS - 1 })]],
      handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Retry })),
      consumerName: "alert"
    });

    await service.drain({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" });

    expect(commits[0].failed[0].ids).toEqual(["1"]);
    expect(commits[0].retriable).toEqual([]);
  });

  // One UPDATE per distinct outcome, not one per row, so a batch of a hundred deliveries is a single
  // statement. Rows on the same attempt share a retry delay, so they group too.
  test("groups rows that share an outcome into one commit entry", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow({ id: 1 }), makeRow({ id: 2 }), makeRow({ id: 3 }), makeRow({ id: 4 })]],
      handle: async (rows) =>
        rows.map((row) =>
          Number(row.id) <= 2
            ? { id: String(row.id), status: EventOutboxStatus.Delivered }
            : { id: String(row.id), status: EventOutboxStatus.Retry, error: "slack 502" }
        )
    });

    await service.drain(KEY);

    expect(commits[0].delivered).toEqual([{ ids: ["1", "2"], progress: undefined }]);
    expect(commits[0].retriable).toHaveLength(1);
    expect(commits[0].retriable[0].ids).toEqual(["3", "4"]);
    expect(commits[0].retriable[0].error).toBe("slack 502");
  });

  test("keeps rows with different progress in separate commit entries", async () => {
    const { service, commits } = buildDrain({
      batches: [[makeRow({ id: 1 }), makeRow({ id: 2 })]],
      handle: async (rows) =>
        rows.map((row) => ({
          id: String(row.id),
          status: EventOutboxStatus.Delivered,
          progress: { deliveredChannelIds: [`c-${row.id}`] }
        }))
    });

    await service.drain(KEY);

    expect(commits[0].delivered.map((group) => group.ids)).toEqual([["1"], ["2"]]);
  });

  // A batch that legitimately outlives the sweeper's threshold (a slow webhook, many rows) has to
  // keep its claim fresh, or the sweeper hands its rows to a second worker mid-delivery.
  test("extends the claim while the consumer is still handling a batch", async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const { service, extended } = buildDrain({
        batches: [[makeRow({ id: 1 }), makeRow({ id: 2 })]],
        handle: (rows) =>
          new Promise((resolve) => {
            release = () =>
              resolve(rows.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Delivered as const })));
          })
      });

      const draining = service.drain(KEY);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(extended.length).toBeGreaterThanOrEqual(3);
      expect(extended[0]).toEqual(["1", "2"]);

      release();
      await draining;

      const afterRelease = extended.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(extended.length).toBe(afterRelease);
    } finally {
      vi.useRealTimers();
    }
  });

  test("leaves rows untouched when no consumer is registered under the key", async () => {
    const { service, commits } = buildDrain({ batches: [[makeRow()]], handle: async () => [] });

    const result = await service.drain({
      consumer: "gone",
      resourceType: "approval.workflow",
      resourceId: "policy-1"
    });

    expect(result.unknownConsumer).toBe(true);
    expect(commits).toHaveLength(0);
  });

  // By this point the consumer has already sent. Letting a transient commit failure escape would leave
  // the rows to the stale sweeper and re-notify ten minutes later, so the commit itself is retried.
  test("retries a failed commit before giving up on it", async () => {
    vi.useFakeTimers();
    try {
      const registry = eventOutboxRegistryFactory();
      registry.register(
        makeConsumer({
          name: "alert",
          handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Delivered }))
        })
      );
      let commitCalls = 0;
      let batchServed = false;
      const service = eventOutboxServiceFactory({
        eventOutboxDAL: {
          claimBatch: async () => {
            if (batchServed) return [];
            batchServed = true;
            return [makeRow()];
          },
          extendClaims: async () => {},
          commitResults: async () => {
            commitCalls += 1;
            if (commitCalls === 1) throw new Error("connection reset");
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
          handle: async (rows) => rows.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Delivered }))
        })
      );
      let commitCalls = 0;
      const service = eventOutboxServiceFactory({
        eventOutboxDAL: {
          claimBatch: async () => [makeRow()],
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
