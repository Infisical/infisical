import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { ActorType } from "@app/services/auth/auth-type";
import { GROUP_MEMBERSHIP_REMOVED_EVENT } from "@app/services/org/org-membership-events";

import { githubOrgSyncServiceFactory } from "./github-org-sync-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// The service builds its GitHub clients itself, so the fakes stand in for the SDK classes.
const github = vi.hoisted(() => ({ userTeams: [] as string[], orgTeams: [] as { name: string; logins: string[] }[] }));

// Constructors that return an object, since `new` on them yields that object.
vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn(function OctokitRest() {
    return {
      rest: {
        orgs: {
          get: async () => ({}),
          getMembershipForAuthenticatedUser: async () => ({ data: { user: { login: "gh-user" } } })
        },
        users: { getAuthenticated: async () => ({}) }
      }
    };
  })
}));

vi.mock("@octokit/core", () => {
  const page = <T>(nodes: T[]) => ({
    totalCount: nodes.length,
    edges: nodes.map((node) => ({ node })),
    pageInfo: { hasNextPage: false, endCursor: null }
  });
  const Octokit = Object.assign(
    vi.fn(function OctokitCore() {
      return {
        graphql: async () => ({
          organization: {
            teams: page(
              github.orgTeams.map(({ name, logins }) => ({
                slug: name,
                name,
                description: null,
                members: page(logins.map((login) => ({ login, databaseId: Number(login.slice(1)) })))
              }))
            )
          }
        })
      };
    }),
    {
      plugin: () =>
        vi.fn(function OctokitWithPaginate() {
          return {
            graphql: {
              paginate: async () => ({
                organization: { teams: page(github.userTeams.map((name) => ({ name, description: "" }))) }
              })
            }
          };
        })
    }
  );
  return { Octokit };
});

const ORG_ID = "org-1";
const SUB_ORG_ID = "sub-org-1";
const TX = { sentinel: "tx" } as unknown as Knex;
const auditLogInfo = {} as AuditLogInfo;

const createService = () => {
  const lockActorsForOrgAccess = vi.fn().mockResolvedValue(undefined);
  const emit = vi.fn().mockResolvedValue(undefined);
  const insertMany = vi.fn(async (rows: unknown[]) => rows);
  const groupDAL = {
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(TX)),
    find: vi.fn(),
    insertMany: vi.fn(async (rows: { name: string }[]) => rows.map((row) => ({ ...row, id: `new-${row.name}` }))),
    findGroupOrgIds: vi.fn(async () => [ORG_ID, SUB_ORG_ID])
  };
  const orgMembershipDAL = { findOrgMembershipsWithUsersByOrgId: vi.fn() };
  const userAliasDAL = { find: vi.fn() };
  const userGroupMembershipDAL = {
    find: vi.fn(),
    findGroupMembershipsByUserIdInOrg: vi.fn(),
    findGroupMembershipsByGroupIdInOrg: vi.fn(),
    insertMany,
    delete: vi.fn().mockResolvedValue([])
  };

  const service = githubOrgSyncServiceFactory({
    githubOrgSyncDAL: {
      findOne: vi.fn().mockResolvedValue({ isActive: true, githubOrgName: "acme", encryptedGithubOrgAccessToken: "x" })
    } as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    } as never,
    kmsService: {
      createCipherPairWithDataKey: vi.fn().mockResolvedValue({ decryptor: () => Buffer.from("token") })
    } as never,
    userGroupMembershipDAL: userGroupMembershipDAL as never,
    groupDAL: groupDAL as never,
    membershipRoleDAL: { insertMany: vi.fn().mockResolvedValue([]) } as never,
    membershipGroupDAL: {
      insertMany: vi.fn(async (rows: unknown[]) => rows.map((row, index) => ({ ...(row as object), id: `m-${index}` })))
    } as never,
    licenseService: { getPlan: vi.fn().mockResolvedValue({ githubOrgSync: true }) } as never,
    orgMembershipDAL: orgMembershipDAL as never,
    userAliasDAL: userAliasDAL as never,
    usageMeteringService: { emit: vi.fn() } as never,
    alertChannelRecipientDAL: { pruneOutOfScopeRecipients: vi.fn().mockResolvedValue(undefined) } as never,
    auditLogService: { createAuditLog: vi.fn().mockResolvedValue(undefined) } as never,
    orgDAL: { lockActorsForOrgAccess },
    eventEmitter: { emit }
  });

  return {
    service,
    groupDAL,
    userGroupMembershipDAL,
    orgMembershipDAL,
    userAliasDAL,
    lockActorsForOrgAccess,
    emit,
    insertMany
  };
};

describe("GitHub org sync and org access reconcile", () => {
  beforeEach(() => vi.clearAllMocks());

  test("login sync emits a group membership removal per group the user left, and locks before adding", async () => {
    const { service, groupDAL, userGroupMembershipDAL, lockActorsForOrgAccess, emit, insertMany } = createService();
    github.userTeams = ["kept", "existing", "brand-new"];
    userGroupMembershipDAL.findGroupMembershipsByUserIdInOrg.mockResolvedValue([
      { groupId: "g-kept", groupName: "kept" },
      { groupId: "g-left", groupName: "left" }
    ]);
    groupDAL.find.mockResolvedValue([{ id: "g-existing", name: "existing" }]);

    await service.syncUserGroups({
      orgId: ORG_ID,
      userId: "user-1",
      username: "user-1@example.com",
      accessToken: "token",
      auditLogInfo
    });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      [
        {
          id: expect.any(String) as string,
          type: GROUP_MEMBERSHIP_REMOVED_EVENT,
          data: {
            groupId: "g-left",
            orgIds: [ORG_ID, SUB_ORG_ID],
            members: [{ actorType: ActorType.USER, actorId: "user-1" }]
          }
        }
      ],
      TX
    );
    expect(groupDAL.findGroupOrgIds).toHaveBeenCalledWith("g-left", TX);

    // One add for the new group, one for the existing group, each behind the lock.
    expect(insertMany).toHaveBeenCalledTimes(2);
    expect(lockActorsForOrgAccess).toHaveBeenCalledTimes(2);
    lockActorsForOrgAccess.mock.calls.forEach(([scope, tx]) => {
      expect(scope).toEqual({ orgId: ORG_ID, actorIds: ["user-1"] });
      expect(tx).toBe(TX);
    });
    lockActorsForOrgAccess.mock.invocationCallOrder.forEach((lockOrder, index) => {
      expect(lockOrder).toBeLessThan(insertMany.mock.invocationCallOrder[index]);
    });
  });

  test("manual sync emits the removed members of each team, and locks the added ones", async () => {
    const {
      service,
      groupDAL,
      userGroupMembershipDAL,
      orgMembershipDAL,
      userAliasDAL,
      lockActorsForOrgAccess,
      emit,
      insertMany
    } = createService();
    // GitHub ids match the user ids' digits: u1 stays, u2 left the team, u3 joined it.
    github.orgTeams = [{ name: "team", logins: ["u1", "u3"] }];
    orgMembershipDAL.findOrgMembershipsWithUsersByOrgId.mockResolvedValue(
      ["1", "2", "3"].map((n) => ({
        id: `om-${n}`,
        status: "accepted",
        isActive: true,
        user: { id: `user-${n}`, username: `user-${n}@example.com`, email: `user-${n}@example.com` }
      }))
    );
    userAliasDAL.find.mockResolvedValue(
      ["1", "2", "3"].map((n) => ({ externalId: n, userId: `user-${n}`, isEmailVerified: true }))
    );
    groupDAL.find.mockResolvedValue([{ id: "g-team", name: "team" }]);
    userGroupMembershipDAL.find.mockResolvedValue([
      { groupId: "g-team", userId: "user-1" },
      { groupId: "g-team", userId: "user-2" }
    ]);
    userGroupMembershipDAL.findGroupMembershipsByGroupIdInOrg.mockResolvedValue([
      { id: "ugm-1", groupId: "g-team", groupName: "team", orgMembershipId: "om-1" },
      { id: "ugm-2", groupId: "g-team", groupName: "team", orgMembershipId: "om-2" }
    ]);

    await service.syncAllTeams({
      orgPermission: { type: ActorType.USER, id: "actor-1", orgId: ORG_ID, authMethod: null },
      auditLogInfo
    } as never);

    expect(userGroupMembershipDAL.delete).toHaveBeenCalledWith({ $in: { id: ["ugm-2"] } }, TX);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      [
        {
          id: expect.any(String) as string,
          type: GROUP_MEMBERSHIP_REMOVED_EVENT,
          data: {
            groupId: "g-team",
            orgIds: [ORG_ID, SUB_ORG_ID],
            members: [{ actorType: ActorType.USER, actorId: "user-2" }]
          }
        }
      ],
      TX
    );

    expect(lockActorsForOrgAccess).toHaveBeenCalledTimes(1);
    expect(lockActorsForOrgAccess).toHaveBeenCalledWith({ orgId: ORG_ID, actorIds: ["user-3"] }, TX);
    expect(lockActorsForOrgAccess.mock.invocationCallOrder[0]).toBeLessThan(insertMany.mock.invocationCallOrder[0]);
  });
});
