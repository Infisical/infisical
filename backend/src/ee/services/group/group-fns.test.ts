import { beforeEach, describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";

import { removeUsersFromGroupByUserIds } from "./group-fns";

const { clearPersonalValuesInProjects } = vi.hoisted(() => ({ clearPersonalValuesInProjects: vi.fn() }));
vi.mock("@app/ee/services/agent-vault-personal-value/agent-vault-personal-value-fns", () => ({
  clearPersonalValuesInProjects
}));
vi.mock("@app/services/membership/membership-dal", () => ({
  lockMembershipsById: vi.fn(async (ids: string[]) =>
    ids.map((id) => ({ id, scopeProjectId: id.replace("membership-", "") }))
  )
}));
vi.mock("@app/services/org/org-membership-events", () => ({
  emitGroupMembershipRemoved: vi.fn(),
  toOrgMembershipActors: vi.fn(() => [])
}));
vi.mock("../pam-session/pam-session-access-fns", () => ({
  terminatePamSessionsLosingGroupAccess: vi.fn(async () => () => {})
}));

const USER_ID = "user-id";
const GROUP = { id: "group-id", name: "group", slug: "group", orgId: "org-id" };
const PROJECT_A = "project-a";
const PROJECT_B = "project-b";
const tx = {};

const createDeps = () => ({
  userDAL: { find: vi.fn().mockResolvedValue([{ id: USER_ID, isAccepted: true }]) },
  userGroupMembershipDAL: {
    find: vi.fn().mockResolvedValue([{ userId: USER_ID, groupId: GROUP.id }]),
    filterProjectsByUserMembership: vi.fn().mockResolvedValue(new Map()),
    delete: vi.fn()
  },
  identityGroupMembershipDAL: { find: vi.fn() },
  agentVaultPersonalValueDAL: {},
  membershipGroupDAL: {
    find: vi.fn().mockResolvedValue([
      { id: `membership-${PROJECT_A}`, scopeProjectId: PROJECT_A },
      { id: `membership-${PROJECT_B}`, scopeProjectId: PROJECT_B }
    ])
  },
  groupDAL: { findGroupOrgIds: vi.fn().mockResolvedValue([GROUP.orgId]) },
  projectKeyDAL: { delete: vi.fn() },
  additionalPrivilegeDAL: { delete: vi.fn() },
  alertChannelRecipientDAL: { pruneOutOfScopeRecipients: vi.fn() },
  eventEmitter: {},
  membershipDAL: {},
  membershipRoleDAL: {},
  pamAccountDAL: {},
  pamSessionDAL: {},
  gatewayV2Service: {}
});

const remove = (deps: ReturnType<typeof createDeps>, extra: { deferPersonalValueClear?: boolean } = {}) =>
  removeUsersFromGroupByUserIds({
    ...(deps as never as Parameters<typeof removeUsersFromGroupByUserIds>[0]),
    group: GROUP,
    userIds: [USER_ID],
    tx: tx as never,
    ...extra
  });

describe("removeUsersFromGroupByUserIds", () => {
  beforeEach(() => clearPersonalValuesInProjects.mockReset());

  test("clears personal values in the group's projects by default", async () => {
    const deps = createDeps();

    await remove(deps);

    expect(deps.membershipGroupDAL.find).toHaveBeenCalledWith(
      { scope: AccessScope.Project, actorGroupId: GROUP.id },
      { tx }
    );
    expect(clearPersonalValuesInProjects).toHaveBeenCalledTimes(1);
    expect(clearPersonalValuesInProjects).toHaveBeenCalledWith(
      expect.anything(),
      { projectIds: [PROJECT_A, PROJECT_B], userIds: [USER_ID] },
      tx
    );
    expect(clearPersonalValuesInProjects.mock.invocationCallOrder[0]).toBeGreaterThan(
      deps.userGroupMembershipDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("skips the clear and returns the group's projects when the caller defers it", async () => {
    const deps = createDeps();

    const { projectIds } = await remove(deps, { deferPersonalValueClear: true });

    expect(clearPersonalValuesInProjects).not.toHaveBeenCalled();
    expect(projectIds).toEqual([PROJECT_A, PROJECT_B]);
    expect(deps.userGroupMembershipDAL.delete).toHaveBeenCalledWith({ groupId: GROUP.id, userId: USER_ID }, tx);
  });

  test("returns no projects when the user is not in the group", async () => {
    const deps = createDeps();
    deps.userGroupMembershipDAL.find.mockResolvedValue([]);

    const { projectIds } = await removeUsersFromGroupByUserIds({
      ...(deps as never as Parameters<typeof removeUsersFromGroupByUserIds>[0]),
      group: GROUP,
      userIds: [USER_ID],
      shouldFailOnMissingMembers: false,
      deferPersonalValueClear: true,
      tx: tx as never
    });

    expect(projectIds).toEqual([]);
    expect(clearPersonalValuesInProjects).not.toHaveBeenCalled();
  });
});
