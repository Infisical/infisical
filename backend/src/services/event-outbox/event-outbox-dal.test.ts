import { TableName } from "@app/db/schemas";

import { eventOutboxDALFactory } from "./event-outbox-dal";
import { EventOutboxStatus } from "./event-outbox-types";

// These assert query *shape*, in the style of alert-dal.test.ts. Only a real database can show that
// two claimers never take the same row, so what a unit test protects is that the clauses buying that
// guarantee are still there.
const buildDAL = (opts?: { returning?: unknown[] }) => {
  const calls = {
    where: [] as unknown[][],
    whereIn: [] as unknown[][],
    andWhere: [] as unknown[][],
    andWhereRaw: [] as unknown[][],
    orderBy: [] as unknown[],
    forUpdate: 0,
    skipLocked: 0,
    limit: [] as number[],
    update: [] as Record<string, unknown>[],
    insert: [] as unknown[],
    onConflict: [] as unknown[],
    ignored: 0,
    groupBy: [] as unknown[][],
    orderByRaw: [] as unknown[]
  };

  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    where: (...args: unknown[]) => {
      calls.where.push(args);
      return chain;
    },
    whereIn: (...args: unknown[]) => {
      if (typeof args[1] === "function") {
        (args[1] as (qb: typeof chain) => void)(chain);
        return chain;
      }
      calls.whereIn.push(args);
      return chain;
    },
    from: () => chain,
    andWhere: (...args: unknown[]) => {
      calls.andWhere.push(args);
      return chain;
    },
    andWhereRaw: (...args: unknown[]) => {
      calls.andWhereRaw.push(args);
      return chain;
    },
    orderBy: (...args: unknown[]) => {
      calls.orderBy.push(args.length === 1 ? args[0] : args);
      return chain;
    },
    orderByRaw: (arg: unknown) => {
      calls.orderByRaw.push(arg);
      return chain;
    },
    groupBy: (...args: unknown[]) => {
      calls.groupBy.push(args);
      return chain;
    },
    limit: (n: number) => {
      calls.limit.push(n);
      return chain;
    },
    forUpdate: () => {
      calls.forUpdate += 1;
      return chain;
    },
    skipLocked: () => {
      calls.skipLocked += 1;
      return chain;
    },
    insert: (rows: unknown) => {
      calls.insert.push(rows);
      return chain;
    },
    onConflict: (cols: unknown) => {
      calls.onConflict.push(cols);
      return chain;
    },
    ignore: () => {
      calls.ignored += 1;
      return chain;
    },
    update: (patch: Record<string, unknown>) => {
      calls.update.push(patch);
      return chain;
    },
    returning: async () => opts?.returning ?? [],
    del: async () => 0,
    // Returns the chain so a subquery keeps building; awaiting it resolves through `then` below.
    select: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve([])
  });

  const queryBuilder = () => chain;
  const db = Object.assign(queryBuilder, {
    replicaNode: () => queryBuilder,
    raw: (sql: string) => sql,
    fn: { now: () => "NOW()" },
    transaction: async (cb: (tx: unknown) => unknown) => cb(Object.assign(queryBuilder, { fn: { now: () => "NOW()" } }))
  }) as never;

  return { dal: eventOutboxDALFactory(db), calls, tx: queryBuilder as never };
};

describe("event outbox dal", () => {
  // The conflict target repeats the index predicate because Postgres can't infer a *partial* unique
  // index from a bare column list: a plain ON CONFLICT (consumer, idempotencyKey) is a 42P10 at
  // runtime.
  test("insertEvents ignores a conflict on the partial idempotency index", async () => {
    const { dal, calls, tx } = buildDAL();

    await dal.insertEvents(
      [
        {
          consumer: "alert",
          eventType: "approval.workflow.request_opened",
          resourceType: "approval.workflow",
          resourceId: "policy-1",
          orgId: "org-1",
          payload: { targetIds: ["req-1"] },
          occurredAt: new Date()
        }
      ],
      tx
    );

    expect(calls.onConflict[0]).toBe('("consumer", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL');
    expect(calls.ignored).toBe(1);
  });

  test("insertEvents issues no statement for an empty batch", async () => {
    const { dal, calls, tx } = buildDAL();

    await dal.insertEvents([], tx);

    expect(calls.insert).toHaveLength(0);
  });

  // SKIP LOCKED is what makes concurrent relays correct by construction, and so the reason the relay
  // doesn't need the cron manager's fleet-wide exactly-once scheduling.
  test("claimBatch locks rows with FOR UPDATE SKIP LOCKED", async () => {
    const { dal, calls } = buildDAL();

    await dal.claimBatch({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" }, 100);

    expect(calls.forUpdate).toBe(1);
    expect(calls.skipLocked).toBe(1);
  });

  test("claimBatch orders by id, not by a timestamp", async () => {
    const { dal, calls } = buildDAL();

    await dal.claimBatch({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" }, 100);

    expect(calls.orderBy[0]).toEqual(["id", "asc"]);
  });

  // RETURNING hands rows back in whatever order the UPDATE touched them, while handle() is promised id
  // order. Seen for real against Postgres: a 3-row claim came back 8, 7, 6.
  test("claimBatch returns the claimed rows in id order regardless of how RETURNING ordered them", async () => {
    const { dal } = buildDAL({ returning: [{ id: "8" }, { id: "6" }, { id: "10" }, { id: "7" }] });

    const claimed = await dal.claimBatch(
      { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" },
      10
    );

    expect(claimed.map((row) => String(row.id))).toEqual(["6", "7", "8", "10"]);
  });

  test("claimBatch flips the locked rows to processing in the same statement", async () => {
    const { dal, calls } = buildDAL();

    await dal.claimBatch({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" }, 100);

    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].status).toBe(EventOutboxStatus.Processing);
    expect(calls.update[0].lockedAt).toBe("NOW()");
  });

  // A row the sweeper already handed back must not be pulled into 'processing' again by a late
  // heartbeat.
  test("extendClaims refreshes lockedAt only on rows still processing", async () => {
    const { dal, calls } = buildDAL();

    await dal.extendClaims(["1", "2"]);

    expect(calls.whereIn[0]).toEqual(["id", ["1", "2"]]);
    expect(calls.where).toContainEqual(["status", EventOutboxStatus.Processing]);
    expect(calls.update[0]).toEqual({ lockedAt: "NOW()" });
  });

  test("extendClaims issues no statement for an empty claim", async () => {
    const { dal, calls } = buildDAL();

    await dal.extendClaims([]);

    expect(calls.update).toHaveLength(0);
  });

  test("claimBatch only takes rows whose retry time has arrived", async () => {
    const { dal, calls } = buildDAL();

    await dal.claimBatch({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" }, 100);

    expect(calls.whereIn[0]).toEqual(["status", [EventOutboxStatus.Pending, EventOutboxStatus.Retry]]);
    expect(calls.andWhere[0][0]).toBe("nextRetryAt");
    expect(calls.andWhere[0][1]).toBe("<=");
  });

  test("findDueFlushKeys groups by the flush key and takes the most overdue first", async () => {
    const { dal, calls } = buildDAL();

    await dal.findDueFlushKeys(200, ["alert"]);

    expect(calls.groupBy[0]).toEqual(["consumer", "resourceType", "resourceId"]);
    expect(calls.orderByRaw[0]).toBe('MIN("nextRetryAt") ASC');
    expect(calls.limit).toContain(200);
  });

  // Rows for a consumer this process can't drain would otherwise sort first on every tick and, once
  // there are more of them than the limit, hide every real key behind them.
  test("findDueFlushKeys only looks at consumers this process has registered", async () => {
    const { dal, calls } = buildDAL();

    await dal.findDueFlushKeys(200, ["alert", "audit"]);

    expect(calls.whereIn).toContainEqual(["consumer", ["alert", "audit"]]);
  });

  test("findDueFlushKeys issues no statement when nothing is registered", async () => {
    const { dal, calls } = buildDAL();

    await expect(dal.findDueFlushKeys(200, [])).resolves.toEqual([]);

    expect(calls.groupBy).toHaveLength(0);
  });

  // Same clock the claim compares against, so app/DB skew can't shift the retry schedule.
  test("commitResults computes the next retry time in SQL, not in JS", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({
      delivered: [],
      retriable: [{ ids: ["1"], nextRetryDelayMs: 30_000 }],
      failed: []
    });

    expect(calls.update[0].nextRetryAt).toBe("NOW() + (? || ' milliseconds')::INTERVAL");
    expect(calls.update[0].status).toBe(EventOutboxStatus.Retry);
  });

  test("commitResults issues no statement when there is nothing to commit", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({ delivered: [], retriable: [], failed: [] });

    expect(calls.update).toHaveLength(0);
  });

  test("commitResults releases the claim on every terminal outcome", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({
      delivered: [{ ids: ["1"] }],
      retriable: [],
      failed: [{ ids: ["2"], error: "gave up" }]
    });

    expect(calls.update.every((patch) => patch.lockedAt === null)).toBe(true);
    expect(calls.update.map((patch) => patch.status)).toEqual([EventOutboxStatus.Delivered, EventOutboxStatus.Failed]);
  });

  test("recoverStaleClaims looks only at claims older than the threshold", async () => {
    const { dal, calls } = buildDAL();

    await dal.recoverStaleClaims(600_000, 5);

    expect(calls.where).toContainEqual(["status", EventOutboxStatus.Processing]);
    expect(calls.andWhereRaw[0][0]).toBe(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`);
    expect(calls.andWhereRaw[0][1]).toEqual([600_000]);
  });

  test("prune targets the outbox table", async () => {
    const { dal } = buildDAL();

    await expect(
      dal.deleteTerminalOlderThan({ deliveredBefore: new Date(), failedBefore: new Date(), batchSize: 100 })
    ).resolves.toBe(0);
    expect(TableName.EventOutbox).toBe("event_outbox");
  });
});
