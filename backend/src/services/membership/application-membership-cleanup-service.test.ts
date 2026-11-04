import { ProjectType, RESOURCE_SCOPE } from "@app/db/schemas";

import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { applicationMembershipCleanupServiceFactory } from "./application-membership-cleanup-service";

const { clearPersonalValuesAfterRevoke } = vi.hoisted(() => ({ clearPersonalValuesAfterRevoke: vi.fn() }));
vi.mock("@app/ee/services/agent-vault-personal-value/agent-vault-personal-value-fns", () => ({
  clearPersonalValuesAfterRevoke
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER_ID = uuid(10);
const IDENTITY_ID = uuid(20);
const GROUP_ID = uuid(30);
const AV_PROJECT_A = uuid(40);
const AV_PROJECT_B = uuid(41);
const SM_PROJECT = uuid(42);
const tx = {} as never;

const PROJECT_TYPES: Record<string, ProjectType> = {
  [AV_PROJECT_A]: ProjectType.AgentVault,
  [AV_PROJECT_B]: ProjectType.AgentVault,
  [SM_PROJECT]: ProjectType.SecretManager
};

const build = () => {
  const deps = {
    membershipDAL: { delete: vi.fn().mockResolvedValue([]) },
    projectDAL: {
      findProjectTypesByIds: vi.fn((ids: string[]) =>
        Promise.resolve(ids.filter((id) => PROJECT_TYPES[id]).map((id) => ({ id, type: PROJECT_TYPES[id] })))
      )
    },
    approvalPolicyDAL: {
      deleteStepApproversBySubject: vi.fn(),
      deleteUserStepApproversInProjects: vi.fn(),
      deleteUserBypassersInProjects: vi.fn()
    },
    agentVaultPersonalValueDAL: { deleteForActorsWithoutGrant: vi.fn() },
    userGroupMembershipDAL: { find: vi.fn() },
    identityGroupMembershipDAL: { find: vi.fn() }
  };
  const service = applicationMembershipCleanupServiceFactory(deps as never);
  return { service, deps };
};

const clearedFor = (
  projectId: string,
  actors: { userIds?: string[]; identityIds?: string[]; groupIds?: string[] }
): unknown[] => [
  expect.objectContaining({ agentVaultPersonalValueDAL: expect.anything() as unknown }) as unknown,
  { projectId, userIds: actors.userIds ?? [], identityIds: actors.identityIds ?? [], groupIds: actors.groupIds ?? [] },
  tx
];

describe("applicationMembershipCleanupService", () => {
  beforeEach(() => {
    clearPersonalValuesAfterRevoke.mockReset();
  });

  test.each([
    [ApplicationMemberKind.User, USER_ID, { userIds: [USER_ID] }],
    [ApplicationMemberKind.Identity, IDENTITY_ID, { identityIds: [IDENTITY_ID] }],
    [ApplicationMemberKind.Group, GROUP_ID, { groupIds: [GROUP_ID] }]
  ])("clears a removed %s's personal values in an Agent Vault project", async (actorKind, actorId, actors) => {
    const { service, deps } = build();

    await service.cleanupActorApplicationMemberships({ projectId: AV_PROJECT_A, actorKind, actorId }, tx);

    expect(clearPersonalValuesAfterRevoke.mock.calls).toEqual([clearedFor(AV_PROJECT_A, actors)]);
    expect(deps.projectDAL.findProjectTypesByIds).toHaveBeenCalledWith([AV_PROJECT_A], tx);
    expect(deps.membershipDAL.delete.mock.invocationCallOrder[0]).toBeLessThan(
      clearPersonalValuesAfterRevoke.mock.invocationCallOrder[0]
    );
  });

  test("leaves other project types alone", async () => {
    const { service, deps } = build();

    await service.cleanupActorApplicationMemberships(
      { projectId: SM_PROJECT, actorKind: ApplicationMemberKind.User, actorId: USER_ID },
      tx
    );
    await service.cleanupUsersApplicationMemberships({ projectId: SM_PROJECT, userIds: [USER_ID] }, tx);

    expect(deps.membershipDAL.delete).toHaveBeenCalledTimes(2);
    expect(clearPersonalValuesAfterRevoke).not.toHaveBeenCalled();
  });

  test("clears the removed users' values after the bulk resource delete", async () => {
    const { service, deps } = build();
    const userIds = [USER_ID, uuid(11)];

    await service.cleanupUsersApplicationMemberships({ projectId: AV_PROJECT_B, userIds }, tx);

    expect(deps.membershipDAL.delete).toHaveBeenCalledWith(
      { scope: RESOURCE_SCOPE, scopeProjectId: AV_PROJECT_B, $in: { actorUserId: userIds } },
      tx
    );
    expect(clearPersonalValuesAfterRevoke.mock.calls).toEqual([clearedFor(AV_PROJECT_B, { userIds })]);
  });

  test("does nothing for an empty user list", async () => {
    const { service, deps } = build();

    await service.cleanupUsersApplicationMemberships({ projectId: AV_PROJECT_A, userIds: [] }, tx);

    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(clearPersonalValuesAfterRevoke).not.toHaveBeenCalled();
  });

  test("on org exit clears users and identities in each Agent Vault project, in id order", async () => {
    const { service } = build();

    await service.cleanupActorsApplicationMembershipsInProjects(
      { projectIds: [AV_PROJECT_B, SM_PROJECT, AV_PROJECT_A], userIds: [USER_ID], identityIds: [IDENTITY_ID] },
      tx
    );

    const actors = { userIds: [USER_ID], identityIds: [IDENTITY_ID] };
    expect(clearPersonalValuesAfterRevoke.mock.calls).toEqual([
      clearedFor(AV_PROJECT_A, actors),
      clearedFor(AV_PROJECT_B, actors)
    ]);
  });

  test("on org exit skips the lookup without actors", async () => {
    const { service, deps } = build();

    await service.cleanupActorsApplicationMembershipsInProjects(
      { projectIds: [AV_PROJECT_A], userIds: [], identityIds: [] },
      tx
    );

    expect(deps.projectDAL.findProjectTypesByIds).not.toHaveBeenCalled();
    expect(clearPersonalValuesAfterRevoke).not.toHaveBeenCalled();
  });
});
