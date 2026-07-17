import { alarmHistoryDALFactory } from "./alarm-history-dal";
import { AlarmRunStatus } from "./alarm-types";

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
  const db = { replicaNode: () => queryBuilder } as never;

  return { dal: alarmHistoryDALFactory(db), whereCalls };
};

describe("alarm history dal", () => {
  test("findRecentlyAlarmedTargets only counts successful deliveries", async () => {
    const { dal, whereCalls } = buildDAL();

    await dal.findRecentlyAlarmedTargets("alarm-1", ["t1", "t2"], 24);

    expect(whereCalls).toContainEqual(["tgt.status", AlarmRunStatus.SUCCESS]);
    expect(whereCalls).toContainEqual(["hist.alarmId", "alarm-1"]);
  });

  test("findRecentlyAlarmedTargets short-circuits on empty target list without querying", async () => {
    const { dal, whereCalls } = buildDAL();

    const result = await dal.findRecentlyAlarmedTargets("alarm-1", [], 24);

    expect(result).toEqual([]);
    expect(whereCalls).toHaveLength(0);
  });
});
