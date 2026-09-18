import { alertHistoryDALFactory } from "./alert-history-dal";
import { AlertRunStatus } from "./alert-types";

// Records the .where() predicates the dedup query applies, so we can assert it filters on the
// per-(channel, target) delivery status (regression for: a transiently FAILED delivery must not
// suppress re-delivery, and a success on one channel must not suppress delivery on another).
const buildDAL = () => {
  const whereCalls: unknown[][] = [];
  const chain = {
    join: () => chain,
    where: (...args: unknown[]) => {
      whereCalls.push(args);
      return chain;
    },
    whereIn: () => chain,
    whereNotNull: () => chain,
    distinct: () => chain,
    select: async () => [] as Array<{ channelId: string; targetId: string }>
  };
  const queryBuilder = () => chain;
  // The dedup read runs against the primary (see alert-history-dal.ts), so `db`
  // itself must be callable; replicaNode is kept for completeness.
  const db = Object.assign(queryBuilder, { replicaNode: () => queryBuilder }) as never;

  return { dal: alertHistoryDALFactory(db), whereCalls };
};

// Drives the retention sweep with a scripted per-batch delete count so we can assert the batching
// contract without a database. Each `del()` returns the next scripted count.
const buildPruneDAL = (deletesPerBatch: number[]) => {
  const rawStatements: string[] = [];
  const whereCalls: unknown[][] = [];
  const limits: number[] = [];
  let batch = 0;

  const chain = () => {
    const link = {
      select: () => link,
      where: (...args: unknown[]) => {
        whereCalls.push(args);
        return link;
      },
      orderBy: () => link,
      limit: (size: number) => {
        limits.push(size);
        return link;
      },
      whereIn: () => link,
      del: async () => {
        const removed = deletesPerBatch[batch] ?? 0;
        batch += 1;
        return removed;
      }
    };
    return link;
  };

  const tx = Object.assign(() => chain(), {
    raw: async (sql: string) => {
      rawStatements.push(sql);
    }
  });
  const db = Object.assign(() => chain(), {
    replicaNode: () => () => chain(),
    transaction: async (cb: (trx: unknown) => Promise<number>) => cb(tx)
  }) as never;

  return { dal: alertHistoryDALFactory(db), rawStatements, whereCalls, limits };
};

describe("alert history dal", () => {
  test("findRecentlyAlertedTargets only counts successful deliveries", async () => {
    const { dal, whereCalls } = buildDAL();

    await dal.findRecentlyAlertedTargets("alert-1", ["t1", "t2"], 24);

    expect(whereCalls).toContainEqual(["tgt.status", AlertRunStatus.SUCCESS]);
    expect(whereCalls).toContainEqual(["hist.alertId", "alert-1"]);
  });

  test("findRecentlyAlertedTargets short-circuits on empty target list without querying", async () => {
    const { dal, whereCalls } = buildDAL();

    const result = await dal.findRecentlyAlertedTargets("alert-1", [], 24);

    expect(result).toEqual([]);
    expect(whereCalls).toHaveLength(0);
  });

  test("deleteExpiredHistory prunes on the cutoff and stops once a batch comes back short", async () => {
    const { dal, whereCalls, limits } = buildPruneDAL([2, 2, 1]);
    const before = new Date("2026-04-27T00:00:00.000Z");

    const result = await dal.deleteExpiredHistory({ before, batchSize: 2, maxBatches: 10 });

    expect(result).toEqual({ deleted: 5, hasMore: false });
    // Three batches ran, then the short one ended the sweep instead of burning the remaining budget.
    expect(limits).toEqual([2, 2, 2]);
    expect(whereCalls).toEqual([
      ["triggeredAt", "<", before],
      ["triggeredAt", "<", before],
      ["triggeredAt", "<", before]
    ]);
  });

  test("deleteExpiredHistory reports hasMore when the per-tick batch cap is reached", async () => {
    const { dal } = buildPruneDAL([2, 2, 2]);

    const result = await dal.deleteExpiredHistory({
      before: new Date("2026-04-27T00:00:00.000Z"),
      batchSize: 2,
      maxBatches: 2
    });

    // Backlog left for the next cron tick rather than draining it all in one handler.
    expect(result).toEqual({ deleted: 4, hasMore: true });
  });

  test("deleteExpiredHistory bounds every batch with a transaction-local statement timeout", async () => {
    const { dal, rawStatements } = buildPruneDAL([1]);

    await dal.deleteExpiredHistory({ before: new Date("2026-04-27T00:00:00.000Z"), batchSize: 2 });

    // SET LOCAL, so the bound reverts on commit and can't leak to a pooled connection.
    expect(rawStatements).toHaveLength(1);
    expect(rawStatements[0]).toMatch(/^SET LOCAL statement_timeout = \d+$/);
  });
});
