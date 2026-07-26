import { TableName } from "@app/db/schemas";

import { alertChannelRecipientDALFactory } from "./alert-channel-recipient-dal";
import { AlertPrincipalType } from "./alert-types";

// Records query-builder calls so we can assert the scope cleanup filters correctly without a DB.
const buildDAL = () => {
  const calls = {
    channelWhere: [] as unknown[][],
    recipientWhere: [] as unknown[][],
    recipientWhereIn: [] as unknown[][]
  };
  const channelChain = {
    select: () => channelChain,
    where: (...args: unknown[]) => {
      calls.channelWhere.push(args);
      return channelChain;
    }
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
    del: async () => 2
  };
  const db = ((table: string) => (table === TableName.AlertChannel ? channelChain : recipientChain)) as never;

  return { dal: alertChannelRecipientDALFactory(db), calls };
};

describe("alert channel recipient dal — scope cleanup", () => {
  test("project removal scopes channels by projectId and prunes only USER principals", async () => {
    const { dal, calls } = buildDAL();

    const deleted = await dal.deleteUsersRecipientsByScope({ userIds: ["u1", "u2"], projectId: "proj-1" });

    expect(deleted).toBe(2);
    expect(calls.channelWhere).toContainEqual([`${TableName.AlertChannel}.projectId`, "proj-1"]);
    expect(calls.recipientWhere).toContainEqual([`${TableName.AlertChannelRecipient}.principalType`, "user"]);
    expect(calls.recipientWhereIn).toContainEqual([`${TableName.AlertChannelRecipient}.principalId`, ["u1", "u2"]]);
  });

  test("org removal scopes channels by orgId (covers org- and project-scoped channels)", async () => {
    const { dal, calls } = buildDAL();

    await dal.deleteUsersRecipientsByScope({ userIds: ["u1"], orgId: "org-1" });

    expect(calls.channelWhere).toContainEqual([`${TableName.AlertChannel}.orgId`, "org-1"]);
  });

  test("no-op when no users or no scope", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.deleteUsersRecipientsByScope({ userIds: [], orgId: "org-1" })).toBe(0);
    expect(await dal.deleteUsersRecipientsByScope({ userIds: ["u1"] })).toBe(0);
    expect(calls.channelWhere).toHaveLength(0);
  });
});

describe("alert channel recipient dal — deleted principal cleanup", () => {
  test("prunes a hard-deleted group's rows everywhere, with no channel scoping", async () => {
    const { dal, calls } = buildDAL();

    const deleted = await dal.deleteByPrincipals({
      principalType: AlertPrincipalType.GROUP,
      principalIds: ["g1"]
    });

    expect(deleted).toBe(2);
    expect(calls.recipientWhere).toContainEqual([`${TableName.AlertChannelRecipient}.principalType`, "group"]);
    expect(calls.recipientWhereIn).toContainEqual([`${TableName.AlertChannelRecipient}.principalId`, ["g1"]]);
    // The principal no longer exists anywhere, so its rows are pruned across every org and project.
    expect(calls.channelWhere).toHaveLength(0);
  });

  test("no-op on an empty principal list", async () => {
    const { dal, calls } = buildDAL();

    expect(await dal.deleteByPrincipals({ principalType: AlertPrincipalType.USER, principalIds: [] })).toBe(0);
    expect(calls.recipientWhere).toHaveLength(0);
  });
});
