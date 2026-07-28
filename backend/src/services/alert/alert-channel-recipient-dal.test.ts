import { TableName } from "@app/db/schemas";

import { alertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

type TChannelQueryLog = {
  where: unknown[][];
  whereIn: unknown[][];
  notExistsSubqueries: number;
  update?: Record<string, unknown>;
};

// Records query-builder calls so we can assert the scope cleanup filters correctly without a DB.
const buildDAL = (opts: { deletedChannelIds?: string[] } = {}) => {
  const deletedChannelIds = opts.deletedChannelIds ?? ["c1", "c2"];

  const calls = {
    recipientWhere: [] as unknown[][],
    recipientWhereIn: [] as unknown[][],
    channelQueries: [] as TChannelQueryLog[]
  };

  // The AlertChannel table is hit for two unrelated things — the channel-scoping subquery and the
  // disable-empty-channels update — so each invocation gets its own log, classified by whether it
  // ended in an update.
  const channelChain = () => {
    const log: TChannelQueryLog = { where: [], whereIn: [], notExistsSubqueries: 0 };
    calls.channelQueries.push(log);

    const subquery = {
      select: () => subquery,
      from: () => subquery,
      whereRaw: () => subquery
    };
    const chain = {
      select: () => chain,
      where: (...args: unknown[]) => {
        log.where.push(args);
        return chain;
      },
      whereIn: (...args: unknown[]) => {
        log.whereIn.push(args);
        return chain;
      },
      whereNotExists: (cb: (qb: typeof subquery) => void) => {
        log.notExistsSubqueries += 1;
        cb(subquery);
        return chain;
      },
      update: async (patch: Record<string, unknown>) => {
        log.update = patch;
        return 1;
      }
    };
    return chain;
  };

  const recipientChain = {
    where: (...args: unknown[]) => {
      calls.recipientWhere.push(args);
      return recipientChain;
    },
    whereIn: (...args: unknown[]) => {
      calls.recipientWhereIn.push(args);
      return recipientChain;
    },
    del: () => ({
      returning: async () => deletedChannelIds.map((channelId) => ({ channelId }))
    })
  };

  const db = ((table: string) =>
    table === TableName.AlertChannel ? channelChain() : recipientChain) as unknown as Parameters<
    typeof alertChannelRecipientDALFactory
  >[0];
  (db as unknown as { raw: (value: string) => string }).raw = (value: string) => value;

  const scopeQueries = () => calls.channelQueries.filter((query) => !query.update);
  const disableQueries = () => calls.channelQueries.filter((query) => query.update);

  return { dal: alertChannelRecipientDALFactory(db), calls, scopeQueries, disableQueries };
};

describe("alert channel recipient dal — scope cleanup", () => {
  test("project removal scopes channels by projectId and prunes only USER principals", async () => {
    const { dal, calls, scopeQueries } = buildDAL();

    const deleted = await dal.deleteUsersRecipientsByScope({ userIds: ["u1", "u2"], projectId: "proj-1" });

    expect(deleted).toBe(2);
    expect(scopeQueries().flatMap((query) => query.where)).toContainEqual([
      `${TableName.AlertChannel}.projectId`,
      "proj-1"
    ]);
    expect(calls.recipientWhere).toContainEqual([`${TableName.AlertChannelRecipient}.principalType`, "user"]);
    expect(calls.recipientWhereIn).toContainEqual([`${TableName.AlertChannelRecipient}.principalId`, ["u1", "u2"]]);
  });

  test("org removal scopes channels by orgId (covers org- and project-scoped channels)", async () => {
    const { dal, scopeQueries } = buildDAL();

    await dal.deleteUsersRecipientsByScope({ userIds: ["u1"], orgId: "org-1" });

    expect(scopeQueries().flatMap((query) => query.where)).toContainEqual([`${TableName.AlertChannel}.orgId`, "org-1"]);
  });

  test("no-op when no users or no scope", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.deleteUsersRecipientsByScope({ userIds: [], orgId: "org-1" })).toBe(0);
    expect(await dal.deleteUsersRecipientsByScope({ userIds: ["u1"] })).toBe(0);
    expect(calls.channelQueries).toHaveLength(0);
  });
});

describe("alert channel recipient dal — deleted principal cleanup", () => {
  test("prunes a hard-deleted group's rows everywhere, with no channel scoping", async () => {
    const { dal, calls, scopeQueries } = buildDAL();

    const deleted = await dal.deleteByPrincipals({
      principalType: AlertPrincipalType.GROUP,
      principalIds: ["g1"]
    });

    expect(deleted).toBe(2);
    expect(calls.recipientWhere).toContainEqual([`${TableName.AlertChannelRecipient}.principalType`, "group"]);
    expect(calls.recipientWhereIn).toContainEqual([`${TableName.AlertChannelRecipient}.principalId`, ["g1"]]);
    // The principal no longer exists anywhere, so its rows are pruned across every org and project.
    expect(scopeQueries()).toHaveLength(0);
  });

  test("no-op on an empty principal list", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.deleteByPrincipals({ principalType: AlertPrincipalType.USER, principalIds: [] })).toBe(0);
    expect(calls.recipientWhere).toHaveLength(0);
    expect(calls.channelQueries).toHaveLength(0);
  });
});

describe("alert channel recipient dal — emptied channels", () => {
  // Rather than deleting a channel (and the alert with it) when its last recipient is pruned, the
  // channel is disabled so nothing of the user's config is destroyed and the cron stops enqueueing
  // an alert that would notify nobody.
  test.each([
    [
      "scope cleanup",
      (dal: ReturnType<typeof buildDAL>["dal"]) => dal.deleteUsersRecipientsByScope({ userIds: ["u1"], orgId: "org-1" })
    ],
    [
      "deleted principal cleanup",
      (dal: ReturnType<typeof buildDAL>["dal"]) =>
        dal.deleteByPrincipals({ principalType: AlertPrincipalType.USER, principalIds: ["u1"] })
    ]
  ])("disables the directed channels left with no recipients after %s", async (_label, prune) => {
    const { dal, disableQueries } = buildDAL({ deletedChannelIds: ["c1", "c1", "c2"] });

    await prune(dal);

    const [disable] = disableQueries();
    expect(disable.update).toEqual({ enabled: false });
    // Only the channels the prune actually touched, deduplicated.
    expect(disable.whereIn).toContainEqual([`${TableName.AlertChannel}.id`, ["c1", "c2"]]);
    // Undirected channels (Slack, webhook, PagerDuty) deliver without recipients, so they are untouched.
    expect(disable.whereIn).toContainEqual([`${TableName.AlertChannel}.channelType`, [AlertChannelType.EMAIL]]);
    // Channels that still have other recipients keep running.
    expect(disable.notExistsSubqueries).toBe(1);
  });

  test("skips the disable pass when the prune deleted nothing", async () => {
    const { dal, disableQueries } = buildDAL({ deletedChannelIds: [] });

    await dal.deleteUsersRecipientsByScope({ userIds: ["u1"], orgId: "org-1" });

    expect(disableQueries()).toHaveLength(0);
  });
});
