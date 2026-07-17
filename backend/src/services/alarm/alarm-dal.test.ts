import { TableName, TAlarms } from "@app/db/schemas";

import { alarmDALFactory } from "./alarm-dal";

// Records the query builder calls so we can assert the cron enumeration excludes alarms bound to
// soft-deleted projects (regression for: a soft-deleted project must not keep firing alarms during
// its cleanup grace window).
const buildDAL = () => {
  const calls = { where: [] as unknown[][], whereNull: [] as unknown[], leftJoin: [] as unknown[][] };
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
    select: () => chain,
    orderBy: async () => [] as TAlarms[]
  };
  const queryBuilder = () => chain;
  const db = { replicaNode: () => queryBuilder } as never;

  return { dal: alarmDALFactory(db), calls };
};

describe("alarm dal", () => {
  test("findEnabledByResourceType excludes alarms in soft-deleted projects", async () => {
    const { dal, calls } = buildDAL();

    await dal.findEnabledByResourceType("identity.credential");

    expect(calls.leftJoin.some((args) => args[0] === TableName.Project)).toBe(true);
    expect(calls.whereNull).toContainEqual(`${TableName.Project}.deleteAfter`);
    expect(calls.where).toContainEqual([`${TableName.Alarm}.enabled`, true]);
    expect(calls.where).toContainEqual([`${TableName.Alarm}.resourceType`, "identity.credential"]);
  });
});
