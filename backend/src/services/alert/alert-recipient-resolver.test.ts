import { alertRecipientResolverFactory } from "./alert-recipient-resolver";
import { AlertPrincipalType } from "./alert-types";

type TUser = { id: string; email: string | null; firstName: string | null };

// Builds a resolver whose DALs reflect a chosen "current membership" so we can assert that a
// user/group removed from the scope after channel config stops receiving alerts at send time.
const buildResolver = (opts: {
  users: TUser[];
  groupMembers?: Record<string, string[]>; // groupId -> userIds (current group membership)
  orgUserIds?: string[]; // users currently in the org
  effectiveProjectUserIds?: string[]; // users currently effective in the project
}) => {
  const usersById = new Map(opts.users.map((u) => [u.id, u]));
  return alertRecipientResolverFactory({
    userDAL: {
      find: async ({ $in }: { $in: { id: string[] } }) =>
        $in.id.map((id) => usersById.get(id)).filter(Boolean) as TUser[]
    } as never,
    userGroupMembershipDAL: {
      find: async ({ $in }: { $in: { groupId: string[] } }) =>
        $in.groupId.flatMap((groupId) => (opts.groupMembers?.[groupId] ?? []).map((userId) => ({ groupId, userId })))
    } as never,
    orgDAL: {
      findMembership: async ({ $in }: { $in: { actorUserId: string[] } }) =>
        $in.actorUserId.filter((id) => (opts.orgUserIds ?? []).includes(id)).map((actorUserId) => ({ actorUserId }))
    } as never,
    projectDAL: {
      findEffectiveProjectSubjectsMembership: async ({ userIds }: { userIds: string[] }) => ({
        effectiveUserIds: userIds.filter((id) => (opts.effectiveProjectUserIds ?? []).includes(id)),
        effectiveGroupIds: [] as string[]
      })
    } as never
  });
};

const user = (id: string): TUser => ({ id, email: `${id}@example.com`, firstName: id.toUpperCase() });

describe("alert recipient resolver — send-time scope re-check", () => {
  test("org scope: drops a user no longer in the org, keeps current members", async () => {
    const resolver = buildResolver({ users: [user("u1"), user("u2")], orgUserIds: ["u1"] });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.USER, principalId: "u1" },
            { principalType: AlertPrincipalType.USER, principalId: "u2" } // removed from org
          ]
        ]
      ]),
      { orgId: "org-1", projectId: null }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email).sort();
    expect(emails).toEqual(["u1@example.com"]);
  });

  test("project scope: drops group members no longer effective in the project", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2"), user("u3")],
      groupMembers: { g1: ["u1", "u2"] }, // g1 still has u1 + u2 as members
      effectiveProjectUserIds: ["u1"] // but only u1 is still an effective project member
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.GROUP, principalId: "g1" },
            { principalType: AlertPrincipalType.USER, principalId: "u3" } // not an effective member
          ]
        ]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u1@example.com"]);
  });
});
