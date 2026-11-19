import { alertRecipientResolverFactory } from "./alert-recipient-resolver";
import { AlertPrincipalType } from "./alert-types";

type TUser = { id: string; email: string | null; firstName: string | null };

type TMemberRole = { role: string; isTemporary?: boolean; temporaryAccessEndTime?: Date };

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
  projectMemberUserIds?: string[]; // users a project member listing returns
  projectGroupMemberUserIds?: string[]; // users a project group member listing returns
  projectMemberRoles?: Record<string, TMemberRole[]>; // userId -> roles on either listing (defaults to member)
  userGroupIds?: Record<string, string[]>; // userId -> groups the user belongs to
  unacceptedUserIds?: string[]; // users who haven't finished signup (defaults to every user having finished)
  orgLinkedGroupIds?: string[]; // groups with a membership in the org, eg a root group linked into a sub-org
  verifiedDomains?: string[];
}) => {
  const usersById = new Map(opts.users.map((u) => [u.id, u]));
  const rolesFor = (id: string) => opts.projectMemberRoles?.[id] ?? [{ role: "member" }];
  return alertRecipientResolverFactory({
    userDAL: {
      find: async ({ $in }: { $in: { id: string[] } }) =>
        ($in.id.map((id) => usersById.get(id)).filter(Boolean) as TUser[]).map((u) => ({
          ...u,
          isAccepted: !(opts.unacceptedUserIds ?? []).includes(u.id)
        }))
    } as never,
    userGroupMembershipDAL: {
      find: async ({ $in }: { $in: { groupId: string[] } }) =>
        $in.groupId.flatMap((groupId) => (opts.groupMembers?.[groupId] ?? []).map((userId) => ({ groupId, userId })))
    } as never,
    orgDAL: {
      // Only users without a direct org row are passed in, so a linked group is their only way in.
      findActorsWithActiveOrgAccess: async ({ userIds }: { userIds: string[] }) => ({
        userIds: new Set(
          userIds.filter((id) =>
            (opts.userGroupIds?.[id] ?? []).some((groupId) => (opts.orgLinkedGroupIds ?? []).includes(groupId))
          )
        ),
        identityIds: new Set<string>()
      }),
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
    } as never,
    projectMembershipDAL: {
      findAllProjectMembers: async () =>
        (opts.projectMemberUserIds ?? []).map((id) => ({ user: { id }, roles: rolesFor(id) }))
    } as never,
    groupProjectDAL: {
      findAllProjectGroupMembers: async () =>
        (opts.projectGroupMemberUserIds ?? []).map((id) => ({ user: { id }, roles: rolesFor(id) }))
    } as never,
    emailDomainDAL: {
      find: async () => (opts.verifiedDomains ?? []).map((domain) => ({ domain }))
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

  test("drops a plain email whose domain is no longer verified", async () => {
    const resolver = buildResolver({ users: [], verifiedDomains: ["verified.example.com"] });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.EMAIL, principalId: "ops@verified.example.com" },
            { principalType: AlertPrincipalType.EMAIL, principalId: "ops@withdrawn.example.com" }
          ]
        ]
      ]),
      { orgId: "org-1", projectId: null }
    );

    expect((result.get("c1") ?? []).map((r) => r.email)).toEqual(["ops@verified.example.com"]);
  });
});

describe("alert recipient resolver — all project members", () => {
  test("expands to the project's current members", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      projectMemberUserIds: ["u1", "u2"],
      effectiveProjectUserIds: ["u1", "u2"]
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }]]]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(
      result
        .get("c1")
        ?.map((r) => r.email)
        .sort()
    ).toEqual(["u1@example.com", "u2@example.com"]);
  });

  test("includes members who are in the project only through a group", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      projectMemberUserIds: ["u1"],
      projectGroupMemberUserIds: ["u1", "u2"],
      effectiveProjectUserIds: ["u1", "u2"]
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }]]]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(
      result
        .get("c1")
        ?.map((r) => r.email)
        .sort()
    ).toEqual(["u1@example.com", "u2@example.com"]);
  });

  test("still drops members whose org membership was deactivated or never accepted", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2"), user("u3")],
      orgUserIds: ["u1"],
      deactivatedUserIds: ["u2"],
      invitedUserIds: ["u3"],
      projectMemberUserIds: ["u1", "u2", "u3"],
      effectiveProjectUserIds: ["u1", "u2"]
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }]]]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(result.get("c1")?.map((r) => r.email)).toEqual(["u1@example.com"]);
  });

  test("ignores a project members recipient that names another project", async () => {
    const resolver = buildResolver({
      users: [user("u1")],
      projectMemberUserIds: ["u1"],
      effectiveProjectUserIds: ["u1"]
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "other-project" }]]]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(result.get("c1")).toEqual([]);
  });

  test("emails a user once when listed directly and through project members", async () => {
    const resolver = buildResolver({
      users: [user("u1")],
      projectMemberUserIds: ["u1"],
      effectiveProjectUserIds: ["u1"]
    });

    const result = await resolver.resolveMany(
      new Map([
        [
          "c1",
          [
            { principalType: AlertPrincipalType.USER, principalId: "u1" },
            { principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }
          ]
        ]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(result.get("c1")).toHaveLength(1);
  });
});

describe("alert recipient resolver — project admins", () => {
  const projectAdmins = new Map([
    ["c1", [{ principalType: AlertPrincipalType.PROJECT_ADMINS, principalId: "proj-1" }]]
  ]);
  const emailsOf = (result: Awaited<ReturnType<ReturnType<typeof buildResolver>["resolveMany"]>>) =>
    result
      .get("c1")
      ?.map((r) => r.email)
      .sort();

  test("expands to the project's admins and skips other members", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      projectMemberUserIds: ["u1", "u2"],
      projectMemberRoles: { u1: [{ role: "admin" }] }
    });

    expect(emailsOf(await resolver.resolveMany(projectAdmins, { orgId: "org-1", projectId: "proj-1" }))).toEqual([
      "u1@example.com"
    ]);
  });

  test("leaves out users who are admins only through a group, as the rotation failure email did", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      projectMemberUserIds: ["u1"],
      projectGroupMemberUserIds: ["u2"],
      projectMemberRoles: { u1: [{ role: "admin" }], u2: [{ role: "admin" }] }
    });

    expect(emailsOf(await resolver.resolveMany(projectAdmins, { orgId: "org-1", projectId: "proj-1" }))).toEqual([
      "u1@example.com"
    ]);
  });

  test("skips an admin whose temporary access has ended, keeps one whose access is still running", async () => {
    const resolver = buildResolver({
      users: [user("u1"), user("u2")],
      projectMemberUserIds: ["u1", "u2"],
      projectMemberRoles: {
        u1: [{ role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() - 60_000) }],
        u2: [{ role: "admin", isTemporary: true, temporaryAccessEndTime: new Date(Date.now() + 60_000) }]
      }
    });

    expect(emailsOf(await resolver.resolveMany(projectAdmins, { orgId: "org-1", projectId: "proj-1" }))).toEqual([
      "u2@example.com"
    ]);
  });

  test("ignores a project admins recipient that names another project", async () => {
    const resolver = buildResolver({
      users: [user("u1")],
      projectMemberUserIds: ["u1"],
      projectMemberRoles: { u1: [{ role: "admin" }] }
    });

    const result = await resolver.resolveMany(
      new Map([["c1", [{ principalType: AlertPrincipalType.PROJECT_ADMINS, principalId: "other-project" }]]]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(result.get("c1")).toEqual([]);
  });
});

describe("alert recipient resolver — project-wide recipients without a direct org membership", () => {
  const projectWide = new Map([
    ["members", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }]],
    ["admins", [{ principalType: AlertPrincipalType.PROJECT_ADMINS, principalId: "proj-1" }]]
  ]);
  // A sub-org admin: no org row of their own, so a group linked into the org is their only way in.
  const subOrgAdmin = {
    users: [user("u1")],
    orgUserIds: [],
    projectMemberUserIds: ["u1"],
    projectMemberRoles: { u1: [{ role: "admin" }] },
    userGroupIds: { u1: ["root-group"] }
  };
  const resolveProjectWide = (opts: Parameters<typeof buildResolver>[0]) =>
    buildResolver(opts).resolveMany(projectWide, { orgId: "org-1", projectId: "proj-1" });

  test("include sub-org members who reach the org through a linked group", async () => {
    const result = await resolveProjectWide({ ...subOrgAdmin, orgLinkedGroupIds: ["root-group"] });

    expect(result.get("members")?.map((r) => r.email)).toEqual(["u1@example.com"]);
    expect(result.get("admins")?.map((r) => r.email)).toEqual(["u1@example.com"]);
  });

  test("drop a member who lost their last group path into the org before the cleanup reached them", async () => {
    const result = await resolveProjectWide({ ...subOrgAdmin, orgLinkedGroupIds: [] });

    expect(result.get("members")).toEqual([]);
    expect(result.get("admins")).toEqual([]);
  });

  test("drop a group-only member who hasn't finished signup", async () => {
    const result = await resolveProjectWide({
      ...subOrgAdmin,
      unacceptedUserIds: ["u1"],
      orgLinkedGroupIds: ["root-group"]
    });

    expect(result.get("members")).toEqual([]);
    expect(result.get("admins")).toEqual([]);
  });

  test("do not let a user picked by name skip the org check through another channel", async () => {
    const resolver = buildResolver({ ...subOrgAdmin, orgLinkedGroupIds: ["root-group"] });

    const result = await resolver.resolveMany(
      new Map([
        ["named", [{ principalType: AlertPrincipalType.USER, principalId: "u1" }]],
        ["everyone", [{ principalType: AlertPrincipalType.PROJECT_MEMBERS, principalId: "proj-1" }]]
      ]),
      { orgId: "org-1", projectId: "proj-1" }
    );

    expect(result.get("named")).toEqual([]);
    expect(result.get("everyone")?.map((r) => r.email)).toEqual(["u1@example.com"]);
  });
});
