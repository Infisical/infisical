import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AccessScope, IdentityAuthMethod } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";

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
  keyStore = { getKeysByPattern: vi.fn(), getItem: vi.fn(), getItems: vi.fn() },
  findIdentities
}: {
  existingMembership?: Record<string, unknown> | null;
  keyStore?: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem" | "getItems">;
  findIdentities?: ReturnType<typeof vi.fn>;
} = {}) => {
  const bumpIdentityRevocationVersion = vi.fn().mockResolvedValue(undefined);
  const insertOrgMembershipRevocationMarker = vi.fn().mockResolvedValue(undefined);
  const removeOrgMembershipRevocationMarkers = vi.fn().mockResolvedValue(undefined);
  const deleteAlertsForResource = vi.fn().mockResolvedValue(0);

  const membershipIdentityDAL = {
    findOne: vi.fn().mockResolvedValue(existingMembership),
    findByIdForUpdate: vi.fn().mockResolvedValue(existingMembership),
    create: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID }),
    updateById: vi.fn().mockImplementation(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
    deleteById: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID }),
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb({} as Knex)),
    findIdentities: findIdentities ?? vi.fn()
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
      // Role name "no-access" skips the privilege-boundary comparison in the guards.
      getOrgPermissionByRoles: vi.fn().mockResolvedValue([{ role: { name: "no-access" }, permission: null }])
    } as never,
    orgDAL: { findById: vi.fn().mockResolvedValue({}), findEffectiveOrgMembership: vi.fn() } as never,
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ orgId: ROOT_ORG_ID, projectId: null })
    } as never,
    licenseService: { getPlan: vi.fn() } as never,
    applicationMembershipCleanupService: { cleanupActorApplicationMemberships: vi.fn() } as never,
    projectDAL: { findById: vi.fn() } as never,
    keyStore: keyStore as never,
    usageMeteringService: { emit: vi.fn(), emitForProject: vi.fn() } as never,
    alertService: { deleteAlertsForResource } as never,
    identityAccessTokenService: {
      insertOrgMembershipRevocationMarker,
      removeOrgMembershipRevocationMarkers,
      bumpIdentityRevocationVersion
    } as never
  });

  return {
    service,
    membershipIdentityDAL,
    bumpIdentityRevocationVersion,
    insertOrgMembershipRevocationMarker,
    removeOrgMembershipRevocationMarkers,
    deleteAlertsForResource
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

const PROJECT_ID = "project-1";

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
      membershipIdentityDAL.deleteById.mock.invocationCallOrder[0]
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

describe("membershipIdentityService.listMemberships", () => {
  beforeEach(() => vi.clearAllMocks());

  const buildRow = (idx: number) => ({
    id: `membership-${idx}`,
    identity: {
      id: `identity-${idx}`,
      name: `identity-${idx}`,
      authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH],
      universalAuthClientId: `client-${idx}`
    },
    roles: []
  });

  test("resolves lockout state for the whole page in one Redis batch", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => buildRow(i));
    const getItems = vi.fn().mockResolvedValue(new Array(20).fill(null) as (string | null)[]);
    const getKeysByPattern = vi.fn().mockResolvedValue([]);
    const findIdentities = vi.fn().mockResolvedValue({ data: rows, totalCount: 20 });

    const { service } = createService({
      keyStore: { getItems, getKeysByPattern, getItem: vi.fn() },
      findIdentities
    });

    const result = await service.listMemberships({
      permission: { type: "user", id: "actor-1", authMethod: null, orgId: "org-1" },
      scopeData: { scope: AccessScope.Project, orgId: "org-1", projectId: "project-1" },
      data: { offset: 0, limit: 20 }
    } as never);

    expect(getItems).toHaveBeenCalledTimes(1);
    expect(getKeysByPattern).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(20);
    expect(result.data[0].identity.activeLockoutAuthMethods).toEqual([]);
  });
});
