import { TableName } from "@app/db/schemas";

import { alertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertChannelType } from "./alert-channel-types";
import { AlertPrincipalType } from "./alert-types";

type TCall = { table: string; method: string; args: unknown[] };

// Records query-builder calls so we can assert what each prune targets without a database. Callbacks
// handed to where/whereExists/whereNotExists are invoked against a nested recorder, so the subquery
// builders still execute and their calls land in the same log.
const buildDAL = (opts: { deletedChannelIds?: string[] } = {}) => {
  const deletedChannelIds = opts.deletedChannelIds ?? ["c1", "c2"];
  const calls: TCall[] = [];

  const createChain = (table: string): Record<string, unknown> => {
    const chain: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop) {
          // Awaiting the chain (the disable-channels update) must not treat it as a promise.
          if (prop === "then") return undefined;
          if (prop === "del") {
            return () => {
              calls.push({ table, method: "del", args: [] });
              return { returning: async () => deletedChannelIds.map((channelId) => ({ channelId })) };
            };
          }
          return (...args: unknown[]) => {
            calls.push({ table, method: String(prop), args });
            args.forEach((arg) => {
              if (typeof arg === "function") (arg as (qb: unknown) => void)(chain);
            });
            return chain;
          };
        }
      }
    );
    return chain;
  };

  const db = ((table: string) => createChain(table)) as unknown as Parameters<
    typeof alertChannelRecipientDALFactory
  >[0];
  (db as unknown as { raw: (value: string) => string }).raw = (value: string) => value;

  const callsOn = (table: string, method: string) =>
    calls.filter((call) => call.table === table && call.method === method);
  const recipientArgs = (method: string) => callsOn(TableName.AlertChannelRecipient, method).flatMap((c) => c.args);

  return { dal: alertChannelRecipientDALFactory(db), calls, callsOn, recipientArgs };
};

describe("alert channel recipient dal — out-of-scope prune", () => {
  test("re-checks the given users against every channel they are a recipient of", async () => {
    const { dal, callsOn, recipientArgs } = buildDAL();

    const deleted = await dal.pruneOutOfScopeRecipients({ userIds: ["u1", "u2"] });

    expect(deleted).toBe(2);
    expect(recipientArgs("where")).toContainEqual(AlertPrincipalType.USER);
    expect(recipientArgs("whereIn")).toContainEqual(["u1", "u2"]);
    // The scope check is the correlated NOT EXISTS, not a pre-computed channel list, so a user who
    // kept access through another path (a group, another project) keeps their rows.
    expect(callsOn(TableName.AlertChannelRecipient, "whereNotExists")).toHaveLength(1);
    // Nothing about the group principals is touched.
    expect(recipientArgs("where")).not.toContainEqual(AlertPrincipalType.GROUP);
  });

  test("a group losing a scope re-checks its own rows and its members' rows", async () => {
    const { dal, callsOn, recipientArgs } = buildDAL();

    await dal.pruneOutOfScopeRecipients({ groupIds: ["g1"] });

    expect(recipientArgs("where")).toContainEqual(AlertPrincipalType.GROUP);
    expect(recipientArgs("where")).toContainEqual(AlertPrincipalType.USER);
    expect(recipientArgs("whereIn")).toContainEqual(["g1"]);
    // Members are reached through a subquery rather than a materialized id list.
    expect(callsOn(TableName.UserGroupMembership, "whereIn").flatMap((call) => call.args)).toContainEqual(["g1"]);
  });

  test("dedupes the principal ids it is handed", async () => {
    const { dal, recipientArgs } = buildDAL();

    await dal.pruneOutOfScopeRecipients({ userIds: ["u1", "u1"] });

    expect(recipientArgs("whereIn")).toContainEqual(["u1"]);
  });

  test("no-op when handed no principals", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.pruneOutOfScopeRecipients({})).toBe(0);
    expect(await dal.pruneOutOfScopeRecipients({ userIds: [], groupIds: [] })).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("alert channel recipient dal — deleted principal cleanup", () => {
  test("prunes a hard-deleted group's rows everywhere, with no scope check", async () => {
    const { dal, callsOn, recipientArgs } = buildDAL();

    const deleted = await dal.deleteByPrincipals({
      principalType: AlertPrincipalType.GROUP,
      principalIds: ["g1"]
    });

    expect(deleted).toBe(2);
    expect(recipientArgs("where")).toContainEqual(AlertPrincipalType.GROUP);
    expect(recipientArgs("whereIn")).toContainEqual(["g1"]);
    // The principal no longer exists anywhere, so its rows go regardless of org or project.
    expect(callsOn(TableName.AlertChannelRecipient, "whereNotExists")).toHaveLength(0);
  });

  test("no-op on an empty principal list", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.deleteByPrincipals({ principalType: AlertPrincipalType.USER, principalIds: [] })).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("alert channel recipient dal — emptied channels", () => {
  // Rather than deleting a channel (and the alert with it) when its last recipient is pruned, the
  // channel is disabled so nothing of the user's config is destroyed and the cron stops enqueueing
  // an alert that would notify nobody.
  test.each([
    [
      "an out-of-scope prune",
      (dal: ReturnType<typeof buildDAL>["dal"]) => dal.pruneOutOfScopeRecipients({ userIds: ["u1"] })
    ],
    [
      "deleted principal cleanup",
      (dal: ReturnType<typeof buildDAL>["dal"]) =>
        dal.deleteByPrincipals({ principalType: AlertPrincipalType.USER, principalIds: ["u1"] })
    ]
  ])("disables the directed channels left with no recipients after %s", async (_label, prune) => {
    const { dal, callsOn } = buildDAL({ deletedChannelIds: ["c1", "c1", "c2"] });

    await prune(dal);

    expect(callsOn(TableName.AlertChannel, "update").flatMap((call) => call.args)).toContainEqual({ enabled: false });
    const channelWhereIn = callsOn(TableName.AlertChannel, "whereIn").flatMap((call) => call.args);
    // Only the channels the prune actually touched, deduplicated.
    expect(channelWhereIn).toContainEqual(["c1", "c2"]);
    // Undirected channels (Slack, webhook, PagerDuty) deliver without recipients, so they are untouched.
    expect(channelWhereIn).toContainEqual([AlertChannelType.EMAIL]);
    // Channels that still have other recipients keep running.
    expect(callsOn(TableName.AlertChannel, "whereNotExists")).toHaveLength(1);
  });

  test("skips the disable pass when the prune deleted nothing", async () => {
    const { dal, callsOn } = buildDAL({ deletedChannelIds: [] });

    await dal.pruneOutOfScopeRecipients({ userIds: ["u1"] });

    expect(callsOn(TableName.AlertChannel, "update")).toHaveLength(0);
  });
});
