import { RESOURCE_SCOPE } from "@app/db/schemas";

import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { applicationMembershipCleanupServiceFactory } from "./application-membership-cleanup-service";

const { clearPersonalValuesInProjects } = vi.hoisted(() => ({ clearPersonalValuesInProjects: vi.fn() }));
vi.mock("@app/ee/services/agent-vault-personal-value/agent-vault-personal-value-fns", () => ({
  clearPersonalValuesInProjects
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER_ID = uuid(10);
const IDENTITY_ID = uuid(20);
const GROUP_ID = uuid(30);
const PROJECT_A = uuid(40);
const PROJECT_B = uuid(41);
const tx = {} as never;

const build = () => {
  const deps = {
    membershipDAL: { delete: vi.fn().mockResolvedValue([]) },
    approvalPolicyDAL: {
      deleteStepApproversBySubject: vi.fn(),
      deleteUserStepApproversInProjects: vi.fn(),
      deleteUserBypassersInProjects: vi.fn()
    },
    agentVaultPersonalValueDAL: { deleteForActorsWithoutGrant: vi.fn(), findProjectIdsWithValues: vi.fn() },
    userGroupMembershipDAL: { find: vi.fn() },
    identityGroupMembershipDAL: { find: vi.fn() }
  };
  const service = applicationMembershipCleanupServiceFactory(deps as never);
  return { service, deps };
};

const clearedFor = (
  projectIds: string[],
  actors: { userIds?: string[]; identityIds?: string[]; groupIds?: string[] }
): unknown[] => [
  expect.objectContaining({
    agentVaultPersonalValueDAL: expect.anything() as unknown,
    userGroupMembershipDAL: expect.anything() as unknown,
    identityGroupMembershipDAL: expect.anything() as unknown
  }) as unknown,
  { projectIds, ...actors },
  tx
];

describe("applicationMembershipCleanupService", () => {
  beforeEach(() => {
    clearPersonalValuesInProjects.mockReset();
  });

  test.each([
    [ApplicationMemberKind.User, USER_ID, { userIds: [USER_ID], identityIds: [], groupIds: [] }],
    [ApplicationMemberKind.Identity, IDENTITY_ID, { userIds: [], identityIds: [IDENTITY_ID], groupIds: [] }],
    [ApplicationMemberKind.Group, GROUP_ID, { userIds: [], identityIds: [], groupIds: [GROUP_ID] }]
  ])("clears a removed %s's personal values after the resource delete", async (actorKind, actorId, actors) => {
    const { service, deps } = build();

    await service.cleanupActorApplicationMemberships({ projectId: PROJECT_A, actorKind, actorId }, tx);

    expect(clearPersonalValuesInProjects.mock.calls).toEqual([clearedFor([PROJECT_A], actors)]);
    expect(deps.membershipDAL.delete.mock.invocationCallOrder[0]).toBeLessThan(
      clearPersonalValuesInProjects.mock.invocationCallOrder[0]
    );
  });

  test("clears the removed users' values after the bulk resource delete", async () => {
    const { service, deps } = build();
    const userIds = [USER_ID, uuid(11)];

    await service.cleanupUsersApplicationMemberships({ projectId: PROJECT_B, userIds }, tx);

    expect(deps.membershipDAL.delete).toHaveBeenCalledWith(
      { scope: RESOURCE_SCOPE, scopeProjectId: PROJECT_B, $in: { actorUserId: userIds } },
      tx
    );
    expect(clearPersonalValuesInProjects.mock.calls).toEqual([clearedFor([PROJECT_B], { userIds })]);
    expect(deps.membershipDAL.delete.mock.invocationCallOrder[0]).toBeLessThan(
      clearPersonalValuesInProjects.mock.invocationCallOrder[0]
    );
  });

  test("does nothing for an empty user list", async () => {
    const { service, deps } = build();

    await service.cleanupUsersApplicationMemberships({ projectId: PROJECT_A, userIds: [] }, tx);

    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(clearPersonalValuesInProjects).not.toHaveBeenCalled();
  });

  test("on org exit clears users and identities across the projects once, after the deletes", async () => {
    const { service, deps } = build();
    const projectIds = [PROJECT_B, PROJECT_A];

    await service.cleanupActorsApplicationMembershipsInProjects(
      { projectIds, userIds: [USER_ID], identityIds: [IDENTITY_ID] },
      tx
    );

    expect(clearPersonalValuesInProjects.mock.calls).toEqual([
      clearedFor(projectIds, { userIds: [USER_ID], identityIds: [IDENTITY_ID] })
    ]);
    expect(deps.membershipDAL.delete.mock.invocationCallOrder[1]).toBeLessThan(
      clearPersonalValuesInProjects.mock.invocationCallOrder[0]
    );
  });

  test("on org exit does nothing without projects", async () => {
    const { service, deps } = build();

    await service.cleanupActorsApplicationMembershipsInProjects(
      { projectIds: [], userIds: [USER_ID], identityIds: [] },
      tx
    );

    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(clearPersonalValuesInProjects).not.toHaveBeenCalled();
  });
});
