import { createMongoAbility } from "@casl/ability";
import knex, { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AccessScope, ProjectType } from "@app/db/schemas";

import { membershipIdentityServiceFactory } from "./membership-identity-service";
import {
  TCreateMembershipIdentityDTO,
  TDeleteMembershipIdentityDTO,
  TUpdateMembershipIdentityDTO
} from "./membership-identity-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

const ROOT_ORG_ID = "root-org";
const SUB_ORG_ID = "sub-org";
const IDENTITY_ID = "identity-1";
const MEMBERSHIP_ID = "membership-1";

// The org-membership delete guard only permits removing a sub-org membership of an
// identity that lives in the parent org, so root/sub/identity orgs must differ.
const buildDto = (): TDeleteMembershipIdentityDTO => ({
  permission: {
    type: "user",
    id: "actor-1",
    authMethod: null,
    orgId: SUB_ORG_ID,
    rootOrgId: ROOT_ORG_ID,
    parentOrgId: ROOT_ORG_ID
  } as unknown as TDeleteMembershipIdentityDTO["permission"],
  scopeData: { scope: AccessScope.Organization, orgId: SUB_ORG_ID },
  selector: { identityId: IDENTITY_ID }
});

const createService = ({
  existingMembership = { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID },
  projectType,
  tx = {} as Knex
}: { existingMembership?: Record<string, unknown> | null; projectType?: ProjectType; tx?: Knex } = {}) => {
  const bumpIdentityRevocationVersion = vi.fn().mockResolvedValue(undefined);
  const insertOrgMembershipRevocationMarker = vi.fn().mockResolvedValue(undefined);
  const removeOrgMembershipRevocationMarkers = vi.fn().mockResolvedValue(undefined);
  const deleteAlertsForResource = vi.fn().mockResolvedValue(0);
  const emit = vi.fn().mockResolvedValue(undefined);
  const deleteByIdentityIdsInGroupsOwnedByOrgs = vi.fn().mockResolvedValue(undefined);
  const deleteMetadata = vi.fn().mockResolvedValue([]);
  const lockActorsForOrgAccess = vi.fn().mockResolvedValue(undefined);
  const revoked = [{ orgId: SUB_ORG_ID, identityId: IDENTITY_ID, projectIds: ["project-1"], resources: [] }];
  const revokeActorsInOrgs = vi.fn().mockResolvedValue({ revoked, sendPamCancellations: () => {} });
  const createAuditLog = vi.fn().mockResolvedValue(undefined);

  const membershipIdentityDAL = {
    findOne: vi.fn().mockResolvedValue(existingMembership),
    // The delete guards bound the removal against the target's current roles. "no-access" is filtered
    // out before resolution, so the target resolves to no roles and the boundary sees an empty ability.
    getIdentityById: vi.fn().mockResolvedValue({ roles: [{ role: "no-access" }] }),
    findByIdForUpdate: vi.fn().mockResolvedValue(existingMembership),
    find: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID }),
    updateById: vi.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
    deleteById: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID }),
    delete: vi.fn().mockResolvedValue([]),
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(tx))
  };

  const service = membershipIdentityServiceFactory({
    membershipIdentityDAL: membershipIdentityDAL as never,
    roleDAL: { find: vi.fn().mockResolvedValue([]) } as never,
    membershipRoleDAL: {
      delete: vi.fn().mockResolvedValue(undefined),
      insertMany: vi.fn().mockResolvedValue([])
    } as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getProjectPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      // These tests cover revocation markers, not the privilege boundary. Built-in roles come back
      // without a `role` field, and an empty target ability clears the boundary for the actor above.
      getOrgPermissionByRoles: vi
        .fn()
        .mockImplementation(async (roles: string[]) => (roles.length ? [{ permission: createMongoAbility([]) }] : [])),
      getProjectPermissionByRoles: vi
        .fn()
        .mockImplementation(async (roles: string[]) => (roles.length ? [{ permission: createMongoAbility([]) }] : []))
    } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({}),
      lockActorsForOrgAccess,
      findActorsWithActiveOrgAccess: vi.fn(async ({ identityIds }: { identityIds: string[] }) => ({
        userIds: new Set<string>(),
        identityIds: new Set(identityIds)
      }))
    } as never,
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ orgId: ROOT_ORG_ID, projectId: null })
    } as never,
    identityMetadataDAL: { delete: deleteMetadata },
    identityGroupMembershipDAL: { deleteByIdentityIdsInGroupsOwnedByOrgs },
    licenseService: { getPlan: vi.fn() } as never,
    applicationMembershipCleanupService: { cleanupActorApplicationMemberships: vi.fn() } as never,
    projectDAL: {
      findById: vi.fn().mockResolvedValue(projectType ? { id: "project-1", type: projectType } : undefined)
    } as never,
    keyStore: { sortedSetRangeByScore: vi.fn().mockResolvedValue([]) } as never,
    usageMeteringService: { emit: vi.fn(), emitForProject: vi.fn() } as never,
    alertService: { deleteAlertsForResource } as never,
    identityAccessTokenService: {
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers,
      bumpIdentityRevocationVersion
    } as never,
    eventEmitter: { emit },
    projectAccessRevokeService: { revokeActorsInOrgs },
    auditLogService: { createAuditLog }
  });

  return {
    service,
    membershipIdentityDAL,
    bumpIdentityRevocationVersion,
    insertOrgMembershipRevocationMarker,
    removeOrgMembershipRevocationMarkers,
    deleteAlertsForResource,
    deleteByIdentityIdsInGroupsOwnedByOrgs,
    deleteMetadata,
    lockActorsForOrgAccess,
    revokeActorsInOrgs,
    createAuditLog,
    emit
  };
};

describe("deleteMembership org revocation bump ordering", () => {
  beforeEach(() => vi.clearAllMocks());

  test("bumps the revocation version after committing its own transaction", async () => {
    const { service, membershipIdentityDAL, bumpIdentityRevocationVersion, insertOrgMembershipRevocationMarker } =
      createService();

    const result = await service.deleteMembership(buildDto());

    expect(membershipIdentityDAL.transaction).toHaveBeenCalledTimes(1);
    expect(insertOrgMembershipRevocationMarker).toHaveBeenCalledTimes(1);
    // The marker is written inside the service-owned transaction, the bump runs after it.
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledTimes(1);
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledWith({ identityId: IDENTITY_ID });
    expect(result).not.toHaveProperty("revocationBumpPending");
  });

  test("defers the bump to the caller when an external transaction is supplied", async () => {
    const { service, membershipIdentityDAL, bumpIdentityRevocationVersion, insertOrgMembershipRevocationMarker } =
      createService();

    const result = await service.deleteMembership(buildDto(), {} as Knex);

    // The caller owns the tx, so we cannot know when it commits: never bump inline.
    expect(membershipIdentityDAL.transaction).not.toHaveBeenCalled();
    expect(insertOrgMembershipRevocationMarker).toHaveBeenCalledTimes(1);
    expect(bumpIdentityRevocationVersion).not.toHaveBeenCalled();
    expect(result).toMatchObject({ revocationBumpPending: { identityId: IDENTITY_ID } });
  });
});

describe("deleteMembership org project access", () => {
  beforeEach(() => vi.clearAllMocks());

  test("revokes everything the org granted the identity in its transaction and audits it after commit", async () => {
    const tx = { marker: "tx" } as unknown as Knex;
    const { service, revokeActorsInOrgs, createAuditLog } = createService({ tx });

    await service.deleteMembership(buildDto());

    expect(revokeActorsInOrgs).toHaveBeenCalledWith({ orgIds: [SUB_ORG_ID], identityIds: [IDENTITY_ID] }, tx);
    expect(createAuditLog).toHaveBeenCalledTimes(1);
  });

  test("hands the revoked access to the caller instead of auditing when it owns the transaction", async () => {
    const { service, createAuditLog } = createService();

    const result = await service.deleteMembership(buildDto(), {} as Knex);

    expect(createAuditLog).not.toHaveBeenCalled();
    expect(result).toMatchObject({ revokedProjectAccess: [{ identityId: IDENTITY_ID, projectIds: ["project-1"] }] });
  });

  test("removing a project membership leaves the rest of the org alone", async () => {
    const { service, revokeActorsInOrgs } = createService();

    await service.deleteMembership({
      ...buildDto(),
      scopeData: { scope: AccessScope.Project, orgId: SUB_ORG_ID, projectId: "project-1" }
    });

    expect(revokeActorsInOrgs).not.toHaveBeenCalled();
  });
});

const PROJECT_ID = "project-1";

describe("project admin identity deactivation", () => {
  test.each([ProjectType.CertificateManager, ProjectType.PAM, ProjectType.AgentVault])(
    "refuses disabling the last admin while retaining its Admin role in %s",
    async (projectType) => {
      const query = knex({ client: "pg" }).queryBuilder();
      vi.spyOn(query, "first").mockResolvedValueOnce({ count: "0" }).mockResolvedValue({ count: "1" });
      const tx = Object.assign(
        vi.fn(() => query),
        { raw: vi.fn().mockResolvedValue(undefined) }
      ) as unknown as Knex;
      const { service, membershipIdentityDAL } = createService({
        projectType,
        tx,
        existingMembership: { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID, isActive: true }
      });
      await expect(
        service.updateMembership({
          ...buildDto(),
          scopeData: { scope: AccessScope.Project, orgId: SUB_ORG_ID, projectId: PROJECT_ID },
          data: { roles: [{ role: "admin", isTemporary: false }], isActive: false }
        })
      ).rejects.toThrow("must keep at least one admin");
      expect(membershipIdentityDAL.updateById).not.toHaveBeenCalled();
      expect(membershipIdentityDAL.findByIdForUpdate).not.toHaveBeenCalled();
      expect(query.toSQL().bindings).toContain(MEMBERSHIP_ID);
    }
  );
});

describe("deleteMembership alert cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  test("removing an org membership reaps the identity's alerts across the whole org", async () => {
    const { service, membershipIdentityDAL, deleteAlertsForResource } = createService();

    await service.deleteMembership(buildDto());

    // No projectId: the identity leaves the org entirely, so its project-scoped alerts here go too.
    expect(deleteAlertsForResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForResource).toHaveBeenCalledWith(
      {
        orgId: SUB_ORG_ID,
        resourceType: "identity.authentication",
        resourceId: IDENTITY_ID
      },
      expect.anything()
    );
    // Reaped at the end of the transaction: the write locks it takes on the org-wide alerts table
    // must not be held across the membership work that precedes it.
    expect(deleteAlertsForResource.mock.invocationCallOrder[0]).toBeGreaterThan(
      membershipIdentityDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("removing a project membership reaps only that project's alerts", async () => {
    const { service, deleteAlertsForResource } = createService();

    await service.deleteMembership({
      ...buildDto(),
      scopeData: { scope: AccessScope.Project, orgId: SUB_ORG_ID, projectId: PROJECT_ID }
    });

    // The identity still exists in the org, so its org-scoped alert must survive.
    expect(deleteAlertsForResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForResource).toHaveBeenCalledWith(
      {
        orgId: SUB_ORG_ID,
        projectId: PROJECT_ID,
        resourceType: "identity.authentication",
        resourceId: IDENTITY_ID
      },
      expect.anything()
    );
  });
});

describe("deleteMembership org access reconcile", () => {
  beforeEach(() => vi.clearAllMocks());

  test("removing an org membership emits the removal in the same transaction", async () => {
    const tx = { marker: "tx" } as unknown as Knex;
    const { service, emit } = createService({ tx });

    await service.deleteMembership(buildDto());

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      [
        {
          id: expect.any(String) as string,
          type: "com.infisical.organization.membership.removed.v1",
          data: { orgId: SUB_ORG_ID, actorType: "identity", actorId: IDENTITY_ID }
        }
      ],
      tx
    );
  });

  test("removing a project membership emits nothing, the identity still reaches the org", async () => {
    const { service, emit } = createService();

    await service.deleteMembership({
      ...buildDto(),
      scopeData: { scope: AccessScope.Project, orgId: SUB_ORG_ID, projectId: PROJECT_ID }
    });

    expect(emit).not.toHaveBeenCalled();
  });
});

describe("deleteMembership org removal", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deletes the identity's rows in the org, its metadata there and its rows in the org's own groups", async () => {
    const tx = { marker: "tx" } as unknown as Knex;
    const { service, membershipIdentityDAL, deleteByIdentityIdsInGroupsOwnedByOrgs, deleteMetadata } = createService({
      tx
    });

    await service.deleteMembership(buildDto());

    expect(membershipIdentityDAL.delete).toHaveBeenCalledWith(
      { actorIdentityId: IDENTITY_ID, scopeOrgId: SUB_ORG_ID },
      tx
    );
    expect(deleteMetadata).toHaveBeenCalledWith({ identityId: IDENTITY_ID, orgId: SUB_ORG_ID }, tx);
    expect(deleteByIdentityIdsInGroupsOwnedByOrgs).toHaveBeenCalledWith(
      { identityIds: [IDENTITY_ID], orgIds: [SUB_ORG_ID] },
      tx
    );
  });

  test("takes the org access lock that group additions take, before anything is removed", async () => {
    const tx = { marker: "tx" } as unknown as Knex;
    const { service, membershipIdentityDAL, lockActorsForOrgAccess } = createService({ tx });

    await service.deleteMembership(buildDto());

    expect(lockActorsForOrgAccess).toHaveBeenCalledWith({ orgId: SUB_ORG_ID, actorIds: [IDENTITY_ID] }, tx);
    expect(lockActorsForOrgAccess.mock.invocationCallOrder[0]).toBeLessThan(
      membershipIdentityDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("revokes project access before the membership delete so the removed project rows are audited", async () => {
    const { service, membershipIdentityDAL, revokeActorsInOrgs } = createService();

    await service.deleteMembership(buildDto());

    expect(revokeActorsInOrgs.mock.invocationCallOrder[0]).toBeLessThan(
      membershipIdentityDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("leaves the org's groups before the revoke so its personal value clear sees the identity out of them", async () => {
    const { service, deleteByIdentityIdsInGroupsOwnedByOrgs, revokeActorsInOrgs } = createService();

    await service.deleteMembership(buildDto());

    expect(deleteByIdentityIdsInGroupsOwnedByOrgs.mock.invocationCallOrder[0]).toBeLessThan(
      revokeActorsInOrgs.mock.invocationCallOrder[0]
    );
  });

  test("removing a project membership leaves the identity's groups alone", async () => {
    const { service, deleteByIdentityIdsInGroupsOwnedByOrgs } = createService();

    await service.deleteMembership({
      ...buildDto(),
      scopeData: { scope: AccessScope.Project, orgId: SUB_ORG_ID, projectId: PROJECT_ID }
    });

    expect(deleteByIdentityIdsInGroupsOwnedByOrgs).not.toHaveBeenCalled();
  });
});

describe("removeIdentityFromOrg", () => {
  beforeEach(() => vi.clearAllMocks());

  test("removes the identity in its own transaction, then bumps and audits after commit", async () => {
    const tx = { marker: "tx" } as unknown as Knex;
    const { service, membershipIdentityDAL, revokeActorsInOrgs, bumpIdentityRevocationVersion, createAuditLog, emit } =
      createService({ tx });
    membershipIdentityDAL.transaction.mockImplementationOnce(async (cb: (tx: Knex) => Promise<unknown>) => {
      const result = await cb(tx);
      expect(bumpIdentityRevocationVersion).not.toHaveBeenCalled();
      expect(createAuditLog).not.toHaveBeenCalled();
      return result;
    });

    await service.removeIdentityFromOrg({ identityId: IDENTITY_ID, orgId: SUB_ORG_ID });

    expect(revokeActorsInOrgs).toHaveBeenCalledWith({ orgIds: [SUB_ORG_ID], identityIds: [IDENTITY_ID] }, tx);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledWith({ identityId: IDENTITY_ID });
    expect(createAuditLog.mock.calls[0][0]).toMatchObject({
      event: { metadata: { identityId: IDENTITY_ID, projectIds: ["project-1"] } }
    });
  });
});

const buildCreateDto = (): TCreateMembershipIdentityDTO => ({
  permission: buildDto().permission,
  scopeData: { scope: AccessScope.Organization, orgId: SUB_ORG_ID },
  data: { identityId: IDENTITY_ID, roles: [{ role: "member", isTemporary: false }] }
});

const buildUpdateDto = (isActive?: boolean): TUpdateMembershipIdentityDTO => ({
  permission: buildDto().permission,
  scopeData: { scope: AccessScope.Organization, orgId: SUB_ORG_ID },
  selector: { identityId: IDENTITY_ID },
  data: { isActive, roles: [{ role: "member", isTemporary: false }] }
});

describe("createMembership org revocation restore", () => {
  beforeEach(() => vi.clearAllMocks());

  test("removes org-scoped markers in the transaction and bumps after commit on re-add", async () => {
    const { service, membershipIdentityDAL, bumpIdentityRevocationVersion, removeOrgMembershipRevocationMarkers } =
      createService({ existingMembership: null });

    await service.createMembership(buildCreateDto());

    expect(membershipIdentityDAL.transaction).toHaveBeenCalledTimes(1);
    expect(removeOrgMembershipRevocationMarkers).toHaveBeenCalledTimes(1);
    expect(removeOrgMembershipRevocationMarkers).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      orgId: SUB_ORG_ID,
      tx: expect.anything() as Knex
    });
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledTimes(1);
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledWith({ identityId: IDENTITY_ID });
  });
});

describe("updateMembership org revocation restore", () => {
  beforeEach(() => vi.clearAllMocks());

  test("reactivating an inactive membership removes markers and bumps, never inserts one", async () => {
    const {
      service,
      bumpIdentityRevocationVersion,
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers
    } = createService({ existingMembership: { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID, isActive: false } });

    await service.updateMembership(buildUpdateDto(true));

    expect(insertOrgMembershipRevocationMarker).not.toHaveBeenCalled();
    expect(removeOrgMembershipRevocationMarkers).toHaveBeenCalledTimes(1);
    expect(removeOrgMembershipRevocationMarkers).toHaveBeenCalledWith({
      identityId: IDENTITY_ID,
      orgId: SUB_ORG_ID,
      tx: expect.anything() as Knex
    });
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledTimes(1);
  });

  test("deactivating an active membership inserts a marker and bumps, never removes markers", async () => {
    const {
      service,
      bumpIdentityRevocationVersion,
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers
    } = createService({ existingMembership: { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID, isActive: true } });

    await service.updateMembership(buildUpdateDto(false));

    expect(insertOrgMembershipRevocationMarker).toHaveBeenCalledTimes(1);
    expect(removeOrgMembershipRevocationMarkers).not.toHaveBeenCalled();
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledTimes(1);
  });

  test("an already-active membership updated without an isActive change touches nothing", async () => {
    const {
      service,
      bumpIdentityRevocationVersion,
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers
    } = createService({ existingMembership: { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID, isActive: true } });

    await service.updateMembership(buildUpdateDto(undefined));

    expect(insertOrgMembershipRevocationMarker).not.toHaveBeenCalled();
    expect(removeOrgMembershipRevocationMarkers).not.toHaveBeenCalled();
    expect(bumpIdentityRevocationVersion).not.toHaveBeenCalled();
  });

  test("decides revoke/restore from the row-locked in-transaction read, not the stale pre-read", async () => {
    // Pre-transaction read says active; by the time the tx locks the row a
    // concurrent update deactivated it. Reactivating must follow the locked
    // read (restore), not the stale snapshot (no-op).
    const {
      service,
      membershipIdentityDAL,
      bumpIdentityRevocationVersion,
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers
    } = createService({ existingMembership: { id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID, isActive: true } });
    membershipIdentityDAL.findByIdForUpdate.mockResolvedValue({
      id: MEMBERSHIP_ID,
      actorIdentityId: IDENTITY_ID,
      isActive: false
    });

    await service.updateMembership(buildUpdateDto(true));

    expect(removeOrgMembershipRevocationMarkers).toHaveBeenCalledTimes(1);
    expect(insertOrgMembershipRevocationMarker).not.toHaveBeenCalled();
    expect(bumpIdentityRevocationVersion).toHaveBeenCalledTimes(1);
  });
});
