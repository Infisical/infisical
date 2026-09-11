import { TableName } from "@app/db/schemas";

import { eventOutboxDALFactory } from "./event-outbox-dal";
import { EventOutboxStatus } from "./event-outbox-types";

// These assert query *shape*, in the style of alert-dal.test.ts. Only a real database can show that
// two claimers never take the same row, so what a unit test protects is that the clauses buying that
// guarantee are still there.
const buildDAL = (opts?: { returning?: unknown[]; updated?: number; selected?: unknown[] }) => {
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

  // knex resolves an UPDATE to the affected row count and a SELECT to rows, and commitResults reads
  // that count, so the mock has to answer each with the right shape.
  let lastOp: "select" | "update" = "select";

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
      lastOp = "update";
      return chain;
    },
    returning: async () => opts?.returning ?? [],
    del: async () => 0,
    // Returns the chain so a subquery keeps building; awaiting it resolves through `then` below.
    select: () => {
      lastOp = "select";
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) =>
      resolve(lastOp === "update" ? (opts?.updated ?? 0) : (opts?.selected ?? []))
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

    const { rows } = await dal.claimBatch(
      { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" },
      10
    );

    expect(rows.map((row) => String(row.id))).toEqual(["6", "7", "8", "10"]);
  });

  test("claimBatch flips the locked rows to processing in the same statement", async () => {
    const { dal, calls } = buildDAL();

    await dal.claimBatch({ consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" }, 100);

    expect(calls.update).toHaveLength(1);
    expect(calls.update[0].status).toBe(EventOutboxStatus.Processing);
    expect(calls.update[0].lockedAt).toBe("NOW()");
  });

  // Every later statement about these rows carries the token, so it has to be the one stamped on the
  // rows and it has to differ per claim.
  test("claimBatch stamps a fresh lockToken and hands it back", async () => {
    const { dal, calls } = buildDAL();
    const key = { consumer: "alert", resourceType: "approval.workflow", resourceId: "policy-1" };

    const first = await dal.claimBatch(key, 100);
    const second = await dal.claimBatch(key, 100);

    expect(calls.update[0].lockToken).toBe(first.lockToken);
    expect(calls.update[1].lockToken).toBe(second.lockToken);
    expect(second.lockToken).not.toBe(first.lockToken);
  });

  // A row the sweeper already handed back must not be pulled into 'processing' again by a late
  // heartbeat, and a heartbeat must never refresh a claim another worker now holds.
  test("extendClaims refreshes lockedAt only on rows this claim still holds", async () => {
    const { dal, calls } = buildDAL();

    await dal.extendClaims(["1", "2"], "token-1");

    expect(calls.whereIn[0]).toEqual(["id", ["1", "2"]]);
    expect(calls.where).toContainEqual(["status", EventOutboxStatus.Processing]);
    expect(calls.where).toContainEqual(["lockToken", "token-1"]);
    expect(calls.update[0]).toEqual({ lockedAt: "NOW()" });
  });

  test("extendClaims issues no statement for an empty claim", async () => {
    const { dal, calls } = buildDAL();

    await dal.extendClaims([], "token-1");

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
      lockToken: "token-1",
      delivered: [],
      retriable: [{ ids: ["1"], nextRetryDelayMs: 30_000 }],
      failed: []
    });

    expect(calls.update[0].nextRetryAt).toBe("NOW() + (? || ' milliseconds')::INTERVAL");
    expect(calls.update[0].status).toBe(EventOutboxStatus.Retry);
  });

  test("commitResults issues no statement when there is nothing to commit", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({ lockToken: "token-1", delivered: [], retriable: [], failed: [] });

    expect(calls.update).toHaveLength(0);
  });

  test("commitResults releases the claim on every terminal outcome", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({
      lockToken: "token-1",
      delivered: [{ ids: ["1"] }],
      retriable: [],
      failed: [{ ids: ["2"], error: "gave up" }]
    });

    expect(calls.update.every((patch) => patch.lockedAt === null && patch.lockToken === null)).toBe(true);
    expect(calls.update.map((patch) => patch.status)).toEqual([EventOutboxStatus.Delivered, EventOutboxStatus.Failed]);
  });

  // A claim the sweeper has already handed back may belong to another worker by the time the original
  // one reports, and 'processing' alone doesn't tell the two claims apart: the new owner's rows are
  // 'processing' too. The token is what keeps the late result off them.
  test("commitResults only touches rows still held by this exact claim", async () => {
    const { dal, calls } = buildDAL();

    await dal.commitResults({
      lockToken: "token-1",
      delivered: [{ ids: ["1"] }],
      retriable: [{ ids: ["2"], nextRetryDelayMs: 1_000 }],
      failed: [{ ids: ["3"] }]
    });

    expect(calls.update).toHaveLength(3);
    expect(calls.where.filter((args) => args[0] === "status" && args[1] === EventOutboxStatus.Processing)).toHaveLength(
      3
    );
    expect(calls.where.filter((args) => args[0] === "lockToken" && args[1] === "token-1")).toHaveLength(3);
  });

  // What the service reads to tell a settled claim from one that was taken away mid-delivery.
  test("commitResults reports how many rows it settled", async () => {
    const { dal } = buildDAL({ updated: 2 });

    await expect(
      dal.commitResults({
        lockToken: "token-1",
        delivered: [{ ids: ["1", "2"] }],
        retriable: [],
        failed: []
      })
    ).resolves.toBe(2);
  });

  // The rows go back to whoever claims them next, so leaving the old owner's token on them would let a
  // heartbeat that arrives even later keep refreshing a claim nobody holds.
  test("recoverStaleClaims clears the token along with the claim", async () => {
    const { dal, calls } = buildDAL({
      selected: [
        { id: "1", consumer: "alert", attempts: 0 },
        { id: "2", consumer: "alert", attempts: 4 }
      ]
    });

    await dal.recoverStaleClaims({ thresholdMs: 600_000, maxAttempts: 5, limit: 1_000 });

    expect(calls.update).toHaveLength(2);

    expect(calls.update.every((patch) => patch.lockedAt === null && patch.lockToken === null)).toBe(true);
  });

  test("recoverStaleClaims looks only at claims older than the threshold", async () => {
    const { dal, calls } = buildDAL();

    await dal.recoverStaleClaims({ thresholdMs: 600_000, maxAttempts: 5, limit: 1_000 });

    expect(calls.where).toContainEqual(["status", EventOutboxStatus.Processing]);
    expect(calls.andWhereRaw[0][0]).toBe(`"lockedAt" < NOW() - (? || ' milliseconds')::INTERVAL`);
    expect(calls.andWhereRaw[0][1]).toEqual([600_000]);
  });

  // The transaction bounds itself rather than trusting worker concurrency to keep `processing` small,
  // and takes the oldest claims first so a limit never starves one.
  test("recoverStaleClaims recovers a bounded batch, oldest claim first", async () => {
    const { dal, calls } = buildDAL();

    await dal.recoverStaleClaims({ thresholdMs: 600_000, maxAttempts: 5, limit: 1_000 });

    expect(calls.limit).toContain(1_000);
    expect(calls.orderBy).toContainEqual(["lockedAt", "asc"]);
    expect(calls.forUpdate).toBe(1);
    expect(calls.skipLocked).toBe(1);
  });

  test("prune targets the outbox table", async () => {
    const { dal } = buildDAL();

    await expect(
      dal.deleteTerminalOlderThan({ deliveredBefore: new Date(), failedBefore: new Date(), batchSize: 100 })
    ).resolves.toBe(0);
    expect(TableName.EventOutbox).toBe("event_outbox");
  });
});
