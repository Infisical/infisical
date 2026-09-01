import { alertRecipientResolverFactory } from "./alert-recipient-resolver";
import { AlertPrincipalType } from "./alert-types";

type TUser = { id: string; email: string | null; firstName: string | null };

// Builds a resolver whose DALs reflect a chosen "current membership" so we can assert that a
// user/group removed from the scope after channel config stops receiving alerts at send time.
const buildResolver = (opts: {
  users: TUser[];
  groupMembers?: Record<string, string[]>; // groupId -> userIds (current group membership)
  orgUserIds?: string[]; // users with an active, accepted org membership (defaults to every user)
  deactivatedUserIds?: string[]; // users whose org membership was deactivated
  invitedUserIds?: string[]; // users invited to the org who never accepted
  effectiveProjectUserIds?: string[]; // users currently effective in the project
  effectiveProjectGroupIds?: string[]; // groups currently holding a project membership
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
      // Mirrors the real DAL closely enough to honour the isActive/status filters the resolver passes.
      findMembership: async (filter: { $in: { actorUserId: string[] }; isActive?: boolean; status?: string }) => {
        const activeUserIds = opts.orgUserIds ?? opts.users.map((u) => u.id);
        return filter.$in.actorUserId
          .flatMap((actorUserId) => {
            if (activeUserIds.includes(actorUserId)) return [{ actorUserId, isActive: true, status: "accepted" }];
            if ((opts.deactivatedUserIds ?? []).includes(actorUserId))
              return [{ actorUserId, isActive: false, status: "accepted" }];
            if ((opts.invitedUserIds ?? []).includes(actorUserId))
              return [{ actorUserId, isActive: true, status: "invited" }];
            return []; // no org membership at all
          })
          .filter(
            (membership) =>
              (filter.isActive === undefined || membership.isActive === filter.isActive) &&
              (filter.status === undefined || membership.status === filter.status)
          );
      }
    } as never,
    projectDAL: {
      findEffectiveProjectSubjectsMembership: async ({
        userIds,
        groupIds
      }: {
        userIds: string[];
        groupIds: string[];
      }) => ({
        effectiveUserIds: userIds.filter((id) => (opts.effectiveProjectUserIds ?? []).includes(id)),
        effectiveGroupIds: groupIds.filter((id) => (opts.effectiveProjectGroupIds ?? []).includes(id))
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
      effectiveProjectUserIds: ["u1"], // but only u1 is still an effective project member
      effectiveProjectGroupIds: ["g1"]
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

  test("project scope: a group removed from the project stops expanding, even for members who keep access", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      groupMembers: { g1: ["u1"], g2: ["u2"] },
      // u1 keeps project access by another path, so a user-level check alone would not stop it.
      effectiveProjectUserIds: ["u1", "u2"],
      effectiveProjectGroupIds: ["g2"] // g1 is no longer a project member
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.GROUP, principalId: "g1" },
            { principalType: AlertPrincipalType.GROUP, principalId: "g2" }
          ]
        ]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u2@example.com"]);
  });

  test("project scope: a user recipient is unaffected by their group losing project membership", async () => {
    const resolver = buildResolver({
      users: [user("u1")],
      groupMembers: { g1: ["u1"] },
      effectiveProjectUserIds: ["u1"],
      effectiveProjectGroupIds: [] // g1 removed from the project
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.GROUP, principalId: "g1" },
            { principalType: AlertPrincipalType.USER, principalId: "u1" } // still a direct recipient
          ]
        ]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u1@example.com"]);
  });

  test("org scope: drops a deactivated user and a user who never accepted their invite", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2"), user("u3")],
      orgUserIds: ["u1"],
      deactivatedUserIds: ["u2"],
      invitedUserIds: ["u3"]
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.USER, principalId: "u1" },
            { principalType: AlertPrincipalType.USER, principalId: "u2" }, // deactivated
            { principalType: AlertPrincipalType.USER, principalId: "u3" } // invite pending
          ]
        ]
      ]),
      { orgId: "org-1", projectId: null }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u1@example.com"]);
  });

  test("project scope: drops a deactivated user who still holds a project membership", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      groupMembers: { g1: ["u1", "u2"] },
      orgUserIds: ["u1"],
      deactivatedUserIds: ["u2"], // deactivating a user leaves their project membership in place
      effectiveProjectUserIds: ["u1", "u2"],
      effectiveProjectGroupIds: ["g1"]
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.GROUP, principalId: "g1" },
            { principalType: AlertPrincipalType.USER, principalId: "u2" }
          ]
        ]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u1@example.com"]);
  });

  test("org scope: groups still expand, since a group cannot leave its own org", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      groupMembers: { g1: ["u1", "u2"] },
      orgUserIds: ["u1"] // u2 left the org
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.GROUP, principalId: "g1" }]]]),
      { orgId: "org-1", projectId: null }
    );

    const emails = (result.get("c1") ?? []).map((r) => r.email);
    expect(emails).toEqual(["u1@example.com"]);
  });
});
