import { TableName, TAlerts } from "@app/db/schemas";

import { alertDALFactory } from "./alert-dal";

// Records the query builder calls so we can assert the cron enumeration excludes alerts bound to
// soft-deleted projects (regression for: a soft-deleted project must not keep firing alerts during
// its cleanup grace window).
const buildDAL = () => {
  const calls = {
    where: [] as unknown[][],
    whereNull: [] as unknown[],
    leftJoin: [] as unknown[][],
    // The whereExists subquery is recorded through its own chain below.
    existsFrom: [] as unknown[],
    existsJoin: [] as unknown[][],
    existsWhere: [] as unknown[][],
    existsWhereRaw: [] as unknown[]
  };

  const existsChain = {
    select: () => existsChain,
    from: (table: unknown) => {
      calls.existsFrom.push(table);
      return existsChain;
    },
    join: (...args: unknown[]) => {
      calls.existsJoin.push(args);
      return existsChain;
    },
    whereRaw: (sql: unknown) => {
      calls.existsWhereRaw.push(sql);
      return existsChain;
    },
    where: (...args: unknown[]) => {
      calls.existsWhere.push(args);
      return existsChain;
    }
  };

  const chain = {
    leftJoin: (...args: unknown[]) => {
      calls.leftJoin.push(args);
      return chain;
    },
    where: (...args: unknown[]) => {
      calls.where.push(args);
      return chain;
    },
    whereNull: (col: unknown) => {
      calls.whereNull.push(col);
      return chain;
    },
    whereExists: (cb: (qb: typeof existsChain) => void) => {
      cb(existsChain);
      return chain;
    },
    select: () => chain,
    orderBy: async () => [] as TAlerts[]
  };
  const queryBuilder = () => chain;
  const db = Object.assign(queryBuilder, { replicaNode: () => queryBuilder, raw: (sql: string) => sql }) as never;

  return { dal: alertDALFactory(db), calls };
};

describe("alert dal", () => {
  test("findEnabledByResourceType excludes alerts in soft-deleted projects", async () => {
    const { dal, calls } = buildDAL();

    await dal.findEnabledByResourceType("identity.authentication");

    expect(calls.leftJoin.some((args) => args[0] === TableName.Project)).toBe(true);
    expect(calls.whereNull).toContainEqual(`${TableName.Project}.deleteAfter`);
    expect(calls.where).toContainEqual([`${TableName.Alert}.enabled`, true]);
    expect(calls.where).toContainEqual([`${TableName.Alert}.resourceType`, "identity.authentication"]);
    // the cron sweep must only pick up scheduled alerts, never event-driven ones
    expect(calls.where).toContainEqual([`${TableName.Alert}.triggerType`, "scheduled"]);
  });

  test("findEnabledByResourceType skips alerts with no enabled channel so the cron enqueues no dead jobs", async () => {
    const { dal, calls } = buildDAL();

    await dal.findEnabledByResourceType("identity.authentication");

    // Semi-join through the membership table to the channels, correlated on the outer alert row.
    expect(calls.existsFrom).toContainEqual(TableName.AlertChannelMembership);
    expect(calls.existsJoin[0]?.[0]).toBe(TableName.AlertChannel);
    expect(calls.existsWhereRaw[0]).toBe(`"${TableName.AlertChannelMembership}"."alertId" = "${TableName.Alert}"."id"`);
    // A channel that exists but is switched off must not keep the alert in the sweep.
    expect(calls.existsWhere).toContainEqual([`${TableName.AlertChannel}.enabled`, true]);
  });
});
