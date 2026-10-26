import { AccessScope, RESOURCE_SCOPE } from "@app/db/schemas";

import { projectAccessRevokeServiceFactory } from "./project-access-revoke-service";

const { sendPamCancellations, terminatePamSessionsForUsers } = vi.hoisted(() => {
  const cancel = vi.fn();
  return { sendPamCancellations: cancel, terminatePamSessionsForUsers: vi.fn(async () => cancel) };
});
vi.mock("@app/ee/services/pam-session/pam-session-access-fns", () => ({ terminatePamSessionsForUsers }));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_ID = uuid(1);
const SUB_ORG_ID = uuid(2);
const USER_ID = uuid(10);
const IDENTITY_ID = uuid(20);
const PROJECT_A = uuid(40);
const PROJECT_B = uuid(41);
const PROJECT_C = uuid(42);
const tx = {} as never;

type TRow = {
  id: string;
  scopeOrgId?: string;
  actorUserId?: string;
  actorIdentityId?: string;
  scopeProjectId: string;
  scopeResourceType?: string;
  scopeResourceId?: string;
};

const build = (opts?: { projectRows?: TRow[]; resourceRows?: TRow[] }) => {
  const ofActor = (rows: TRow[], filter: { $in?: { actorUserId?: string[]; actorIdentityId?: string[] } }) =>
    rows.filter((row) => Boolean(filter.$in?.actorUserId ? row.actorUserId : row.actorIdentityId));
  const deps = {
    membershipDAL: {
      find: vi.fn(),
      delete: vi.fn((filter: { $in?: { actorUserId?: string[]; actorIdentityId?: string[] } }) =>
        Promise.resolve(
          ofActor(opts?.projectRows ?? [], filter).map((row) => ({
            scopeOrgId: ORG_ID,
            ...row,
            scope: AccessScope.Project
          }))
        )
      )
    },
    projectDAL: { find: vi.fn().mockResolvedValue([{ id: PROJECT_A }, { id: PROJECT_B }, { id: PROJECT_C }]) },
    projectKeyDAL: { delete: vi.fn().mockResolvedValue([]) },
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue([]) },
    applicationMembershipCleanupService: {
      cleanupActorsApplicationMembershipsInProjects: vi.fn((filter: { userIds: string[]; identityIds: string[] }) =>
        Promise.resolve(
          (opts?.resourceRows ?? [])
            .filter((row) =>
              row.actorUserId
                ? filter.userIds.includes(row.actorUserId)
                : filter.identityIds.includes(row.actorIdentityId!)
            )
            .map((row) => ({ scopeOrgId: ORG_ID, ...row, scope: RESOURCE_SCOPE }))
        )
      )
    },
    alertChannelRecipientDAL: { pruneOutOfScopeRecipients: vi.fn().mockResolvedValue(0) },
    pamSessionDAL: { findLiveByOrgAndUserIds: vi.fn(), update: vi.fn() },
    gatewayV2Service: { getPAMConnectionDetails: vi.fn() }
  };
  const service = projectAccessRevokeServiceFactory(deps as never);
  return { service, deps };
};

describe("projectAccessRevokeService", () => {
  beforeEach(() => {
    sendPamCancellations.mockClear();
    terminatePamSessionsForUsers.mockClear();
  });

  test("does nothing without actors or orgs", async () => {
    const { service, deps } = build();

    const forNoActors = await service.revokeActorsInOrgs({ orgIds: [ORG_ID] }, tx);
    const forNoOrgs = await service.revokeActorsInOrgs({ orgIds: [], userIds: [USER_ID] }, tx);

    expect(forNoActors.revoked).toEqual([]);
    expect(forNoOrgs.revoked).toEqual([]);
    expect(deps.membershipDAL.delete).not.toHaveBeenCalled();
    expect(terminatePamSessionsForUsers).not.toHaveBeenCalled();
    expect(() => forNoActors.sendPamCancellations()).not.toThrow();
  });

  test("removes a user's project rows in the orgs and everything keyed on actor + project across them", async () => {
    const { service, deps } = build({
      projectRows: [
        { id: uuid(100), actorUserId: USER_ID, scopeProjectId: PROJECT_A },
        { id: uuid(101), scopeOrgId: SUB_ORG_ID, actorUserId: USER_ID, scopeProjectId: PROJECT_B }
      ]
    });
    const orgIds = [ORG_ID, SUB_ORG_ID];
    const allProjects = [PROJECT_A, PROJECT_B, PROJECT_C];

    const { revoked, sendPamCancellations: send } = await service.revokeActorsInOrgs(
      { orgIds, userIds: [USER_ID] },
      tx
    );

    expect(deps.membershipDAL.delete).toHaveBeenCalledTimes(1);
    expect(deps.membershipDAL.delete).toHaveBeenCalledWith(
      { scope: AccessScope.Project, $in: { scopeOrgId: orgIds, actorUserId: [USER_ID] } },
      tx
    );
    expect(deps.projectDAL.find).toHaveBeenCalledWith({ $in: { orgId: orgIds } }, { tx });
    expect(deps.applicationMembershipCleanupService.cleanupActorsApplicationMembershipsInProjects).toHaveBeenCalledWith(
      { projectIds: allProjects, userIds: [USER_ID], identityIds: [] },
      tx
    );
    expect(deps.projectKeyDAL.delete).toHaveBeenCalledWith(
      { $in: { receiverId: [USER_ID], projectId: allProjects } },
      tx
    );
    expect(deps.additionalPrivilegeDAL.delete).toHaveBeenCalledTimes(1);
    expect(deps.additionalPrivilegeDAL.delete).toHaveBeenCalledWith(
      { $in: { actorUserId: [USER_ID], projectId: allProjects } },
      tx
    );
    expect(deps.alertChannelRecipientDAL.pruneOutOfScopeRecipients).toHaveBeenCalledWith({ userIds: [USER_ID] }, tx);
    expect(terminatePamSessionsForUsers).toHaveBeenCalledWith(
      expect.objectContaining({ orgIds, userIds: [USER_ID], tx })
    );
    expect(send).toBe(sendPamCancellations);
    expect(revoked).toEqual([
      { orgId: ORG_ID, userId: USER_ID, projectIds: [PROJECT_A], resources: [] },
      { orgId: SUB_ORG_ID, userId: USER_ID, projectIds: [PROJECT_B], resources: [] }
    ]);
  });

  test("removes an identity's rows and resource grants and reports them per actor", async () => {
    const { service, deps } = build({
      projectRows: [{ id: uuid(102), actorIdentityId: IDENTITY_ID, scopeProjectId: PROJECT_A }],
      resourceRows: [
        {
          id: uuid(202),
          actorIdentityId: IDENTITY_ID,
          scopeProjectId: PROJECT_A,
          scopeResourceType: "pam-account",
          scopeResourceId: uuid(302)
        }
      ]
    });

    const { revoked } = await service.revokeActorsInOrgs({ orgIds: [ORG_ID], identityIds: [IDENTITY_ID] }, tx);

    expect(deps.membershipDAL.delete).toHaveBeenCalledWith(
      { scope: AccessScope.Project, $in: { scopeOrgId: [ORG_ID], actorIdentityId: [IDENTITY_ID] } },
      tx
    );
    expect(deps.additionalPrivilegeDAL.delete).toHaveBeenCalledWith(
      { $in: { actorIdentityId: [IDENTITY_ID], projectId: [PROJECT_A, PROJECT_B, PROJECT_C] } },
      tx
    );
    expect(deps.projectKeyDAL.delete).not.toHaveBeenCalled();
    expect(deps.alertChannelRecipientDAL.pruneOutOfScopeRecipients).not.toHaveBeenCalled();
    expect(revoked).toEqual([
      {
        orgId: ORG_ID,
        identityId: IDENTITY_ID,
        projectIds: [PROJECT_A],
        resources: [{ projectId: PROJECT_A, resourceType: "pam-account", resourceId: uuid(302) }]
      }
    ]);
  });

  test("reports a resource grant in a project the user held no project row in", async () => {
    const { service } = build({
      resourceRows: [
        {
          id: uuid(203),
          actorUserId: USER_ID,
          scopeProjectId: PROJECT_C,
          scopeResourceType: "pam-folder",
          scopeResourceId: uuid(303)
        }
      ]
    });

    const { revoked } = await service.revokeActorsInOrgs({ orgIds: [ORG_ID], userIds: [USER_ID] }, tx);

    expect(revoked).toEqual([
      {
        orgId: ORG_ID,
        userId: USER_ID,
        projectIds: [],
        resources: [{ projectId: PROJECT_C, resourceType: "pam-folder", resourceId: uuid(303) }]
      }
    ]);
  });

  test("skips the per-project reaps when the orgs hold no projects", async () => {
    const { service, deps } = build();
    deps.projectDAL.find.mockResolvedValue([]);

    const { revoked } = await service.revokeActorsInOrgs({ orgIds: [ORG_ID], userIds: [USER_ID] }, tx);

    expect(revoked).toEqual([]);
    expect(
      deps.applicationMembershipCleanupService.cleanupActorsApplicationMembershipsInProjects
    ).not.toHaveBeenCalled();
    expect(deps.projectKeyDAL.delete).not.toHaveBeenCalled();
    expect(deps.additionalPrivilegeDAL.delete).not.toHaveBeenCalled();
    expect(deps.alertChannelRecipientDAL.pruneOutOfScopeRecipients).toHaveBeenCalledWith({ userIds: [USER_ID] }, tx);
  });
});
