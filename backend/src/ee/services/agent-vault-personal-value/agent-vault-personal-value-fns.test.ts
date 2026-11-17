import { PgSqlLock } from "@app/keystore/keystore";

import { clearPersonalValuesInProjects } from "./agent-vault-personal-value-fns";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER_ID = uuid(10);
const GROUP_USER_ID = uuid(11);
const IDENTITY_ID = uuid(20);
const GROUP_IDENTITY_ID = uuid(21);
const GROUP_ID = uuid(30);
const PROJECT_A = uuid(40);
const PROJECT_B = uuid(41);
const PROJECT_C = uuid(42);

const build = (projectsWithValues: string[], projectsWithAnyValues = projectsWithValues) => {
  const tx = { raw: vi.fn() };
  const deps = {
    agentVaultPersonalValueDAL: {
      findProjectIdsWithValues: vi.fn().mockResolvedValue(projectsWithValues),
      findProjectIdsWithAnyValues: vi.fn().mockResolvedValue(projectsWithAnyValues),
      deleteForActorsWithoutGrant: vi.fn().mockResolvedValue(0)
    },
    userGroupMembershipDAL: {
      find: vi.fn().mockResolvedValue([{ userId: GROUP_USER_ID }, { userId: USER_ID }])
    },
    identityGroupMembershipDAL: { find: vi.fn().mockResolvedValue([{ identityId: GROUP_IDENTITY_ID }]) }
  };
  return { tx, deps };
};

describe("clearPersonalValuesInProjects", () => {
  test("clears only the projects where the actors hold values, in the order found, each under its lock", async () => {
    const { tx, deps } = build([PROJECT_A, PROJECT_C]);

    await clearPersonalValuesInProjects(
      deps as never,
      { projectIds: [PROJECT_C, PROJECT_B, PROJECT_A], userIds: [USER_ID], identityIds: [IDENTITY_ID] },
      tx as never
    );

    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithValues).toHaveBeenCalledWith(
      { projectIds: [PROJECT_C, PROJECT_B, PROJECT_A], userIds: [USER_ID], identityIds: [IDENTITY_ID] },
      tx
    );
    expect(deps.userGroupMembershipDAL.find).not.toHaveBeenCalled();
    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithAnyValues).not.toHaveBeenCalled();
    expect(tx.raw.mock.calls).toEqual([
      ["SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ClearAgentVaultPersonalValues(PROJECT_A)]],
      ["SELECT pg_advisory_xact_lock(?)", [PgSqlLock.ClearAgentVaultPersonalValues(PROJECT_C)]]
    ]);
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsWithoutGrant.mock.calls).toEqual([
      [{ projectId: PROJECT_A, accessBundleId: undefined, userIds: [USER_ID], identityIds: [IDENTITY_ID] }, tx],
      [{ projectId: PROJECT_C, accessBundleId: undefined, userIds: [USER_ID], identityIds: [IDENTITY_ID] }, tx]
    ]);
    expect(tx.raw.mock.invocationCallOrder[0]).toBeGreaterThan(
      deps.agentVaultPersonalValueDAL.findProjectIdsWithValues.mock.invocationCallOrder[0]
    );
  });

  test("looks up and clears a group's members once", async () => {
    const { tx, deps } = build([PROJECT_A], [PROJECT_A]);

    await clearPersonalValuesInProjects(
      deps as never,
      { projectIds: [PROJECT_B, PROJECT_A], userIds: [USER_ID], groupIds: [GROUP_ID] },
      tx as never
    );

    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithAnyValues).toHaveBeenCalledWith(
      [PROJECT_B, PROJECT_A],
      tx
    );
    expect(deps.userGroupMembershipDAL.find).toHaveBeenCalledWith({ $in: { groupId: [GROUP_ID] } }, { tx });
    expect(deps.identityGroupMembershipDAL.find).toHaveBeenCalledWith({ $in: { groupId: [GROUP_ID] } }, { tx });
    const actors = { userIds: [USER_ID, GROUP_USER_ID], identityIds: [GROUP_IDENTITY_ID] };
    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithValues).toHaveBeenCalledWith(
      { projectIds: [PROJECT_A], ...actors },
      tx
    );
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsWithoutGrant).toHaveBeenCalledWith(
      { projectId: PROJECT_A, accessBundleId: undefined, ...actors },
      tx
    );
    expect(deps.userGroupMembershipDAL.find).toHaveBeenCalledTimes(1);
  });

  test("skips reading a group's members when none of its projects holds a value", async () => {
    const { tx, deps } = build([PROJECT_A], []);

    await clearPersonalValuesInProjects(deps as never, { projectIds: [PROJECT_A], groupIds: [GROUP_ID] }, tx as never);

    expect(deps.userGroupMembershipDAL.find).not.toHaveBeenCalled();
    expect(deps.identityGroupMembershipDAL.find).not.toHaveBeenCalled();
    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithValues).not.toHaveBeenCalled();
    expect(tx.raw).not.toHaveBeenCalled();
  });

  test("takes no lock when no project holds the actors' values", async () => {
    const { tx, deps } = build([]);

    await clearPersonalValuesInProjects(deps as never, { projectIds: [PROJECT_A], userIds: [USER_ID] }, tx as never);

    expect(tx.raw).not.toHaveBeenCalled();
    expect(deps.agentVaultPersonalValueDAL.deleteForActorsWithoutGrant).not.toHaveBeenCalled();
  });

  test.each([
    ["no projects", { projectIds: [], userIds: [USER_ID] }],
    ["no actors", { projectIds: [PROJECT_A] }]
  ])("does nothing with %s", async (_, args) => {
    const { tx, deps } = build([PROJECT_A]);

    await clearPersonalValuesInProjects(deps as never, args, tx as never);

    expect(deps.agentVaultPersonalValueDAL.findProjectIdsWithValues).not.toHaveBeenCalled();
    expect(tx.raw).not.toHaveBeenCalled();
  });
});
