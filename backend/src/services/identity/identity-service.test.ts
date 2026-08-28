import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { identityServiceFactory } from "./identity-service";
import { TDeleteIdentityDTO } from "./identity-types";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

// The delete path opens with an instance-admin check that reads server config from the database.
vi.mock("../super-admin/super-admin-fns", () => ({
  validateIdentityUpdateForSuperAdminPrivileges: vi.fn().mockResolvedValue(undefined),
  isSuperAdmin: vi.fn().mockReturnValue(false)
}));

const ORG_ID = "org-1";
const ROOT_ORG_ID = "root-org";
const IDENTITY_ID = "identity-1";
const RESOURCE_TYPE = "identity.authentication";

// A sentinel so a test can prove a call joined the service's transaction rather than
// checking out its own connection.
const TX = { sentinel: "tx" } as unknown as Knex;

const buildDto = (): TDeleteIdentityDTO =>
  ({
    actor: "user",
    actorId: "actor-1",
    actorAuthMethod: null,
    actorOrgId: ORG_ID,
    id: IDENTITY_ID
  }) as unknown as TDeleteIdentityDTO;

const createService = ({
  // Equal to actorOrgId means the identity lives here and the row itself is deleted. Different
  // means it was only invited in, so the delete just takes the membership away.
  identityOrgId = ORG_ID,
  hasDeleteProtection = false
}: { identityOrgId?: string; hasDeleteProtection?: boolean } = {}) => {
  const deleteAlertsForResource = vi.fn().mockResolvedValue(0);
  const deleteAlertsForDeletedResource = vi.fn().mockResolvedValue(0);

  const identityDAL = {
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(TX)),
    deleteById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "ident" }),
    findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "ident" })
  };

  const membershipIdentityDAL = {
    getIdentityById: vi.fn().mockResolvedValue({
      scopeOrgId: ORG_ID,
      identity: { id: IDENTITY_ID, orgId: identityOrgId, projectId: null, hasDeleteProtection }
    }),
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(TX)),
    find: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue({ id: "membership-1" })
  };

  const service = identityServiceFactory({
    identityDAL: identityDAL as never,
    identityMetadataDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    identityOrgMembershipDAL: {} as never,
    membershipIdentityDAL: membershipIdentityDAL as never,
    membershipRoleDAL: {} as never,
    identityProjectDAL: { findByIdentityId: vi.fn() } as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getOrgPermissionByRoles: vi.fn()
    } as never,
    licenseService: { getPlan: vi.fn(), getOrgSeatUsage: vi.fn(), updateSubscriptionOrgMemberCount: vi.fn() } as never,
    keyStore: { sortedSetRangeByScore: vi.fn().mockResolvedValue([]) } as never,
    orgDAL: { findById: vi.fn(), findEffectiveOrgMembership: vi.fn() } as never,
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    usageMeteringService: { emit: vi.fn() } as never,
    alertService: { deleteAlertsForResource, deleteAlertsForDeletedResource } as never,
    identityAccessTokenService: {
      insertIdentityWideRevocationMarker: vi.fn().mockResolvedValue(undefined),
      insertOrgMembershipRevocationMarker: vi.fn().mockResolvedValue(undefined),
      bumpIdentityRevocationVersion: vi.fn().mockResolvedValue(undefined)
    } as never
  });

  return { service, identityDAL, membershipIdentityDAL, deleteAlertsForResource, deleteAlertsForDeletedResource };
};

describe("deleteIdentity alert cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deleting the identity row reaps its alerts in every org, in the same transaction", async () => {
    const { service, identityDAL, deleteAlertsForResource, deleteAlertsForDeletedResource } = createService();

    await service.deleteIdentity(buildDto());

    // alerts.resourceId has no FK, and the identity can have been watched from a child org it was
    // invited into, so the reap must not be filtered by org.
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledWith(
      { resourceType: RESOURCE_TYPE, resourceId: IDENTITY_ID },
      TX
    );
    expect(deleteAlertsForResource).not.toHaveBeenCalled();
    // Same tx as the row delete: the alerts come back if the delete rolls back.
    expect(identityDAL.deleteById).toHaveBeenCalledWith(IDENTITY_ID, TX);
  });

  test("removing an identity that belongs to another org reaps only this org's alerts", async () => {
    const { service, membershipIdentityDAL, deleteAlertsForResource, deleteAlertsForDeletedResource } = createService({
      identityOrgId: ROOT_ORG_ID
    });

    await service.deleteIdentity(buildDto());

    // The identity survives in its own org, so its alerts elsewhere must survive with it.
    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
    expect(deleteAlertsForResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForResource).toHaveBeenCalledWith(
      { orgId: ORG_ID, resourceType: RESOURCE_TYPE, resourceId: IDENTITY_ID },
      TX
    );
    expect(membershipIdentityDAL.delete).toHaveBeenCalledWith({ actorIdentityId: IDENTITY_ID, scopeOrgId: ORG_ID }, TX);
    // Reaped at the end of the transaction: the write locks it takes on the org-wide alerts table
    // must not be held across the membership work that precedes it.
    expect(deleteAlertsForResource.mock.invocationCallOrder[0]).toBeGreaterThan(
      membershipIdentityDAL.delete.mock.invocationCallOrder[0]
    );
  });

  test("delete protection stops the delete before anything is reaped", async () => {
    const { service, deleteAlertsForResource, deleteAlertsForDeletedResource } = createService({
      hasDeleteProtection: true
    });

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow("Identity has delete protection");

    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
    expect(deleteAlertsForResource).not.toHaveBeenCalled();
  });
});
