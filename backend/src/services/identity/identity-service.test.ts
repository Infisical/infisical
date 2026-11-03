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
  hasDeleteProtection = false,
  identityName = "ident"
}: { identityOrgId?: string; hasDeleteProtection?: boolean; identityName?: string } = {}) => {
  const deleteAlertsForDeletedResource = vi.fn().mockResolvedValue(0);
  const removeIdentityFromOrg = vi.fn().mockResolvedValue(undefined);

  const identityDAL = {
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb(TX)),
    deleteById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "ident" }),
    findById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: identityName, orgId: identityOrgId, projectId: null }),
    updateById: vi.fn().mockResolvedValue({ id: IDENTITY_ID, name: "renamed", orgId: identityOrgId })
  };

  const membershipIdentityDAL = {
    getIdentityById: vi.fn().mockResolvedValue({
      scopeOrgId: ORG_ID,
      // The real query inner-joins MembershipRole, so a membership always carries at least one role.
      roles: [{ role: "member" }],
      identity: { id: IDENTITY_ID, orgId: identityOrgId, projectId: null, hasDeleteProtection }
    })
  };

  const service = identityServiceFactory({
    identityDAL: identityDAL as never,
    identityMetadataDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    identityOrgMembershipDAL: {} as never,
    membershipIdentityDAL: membershipIdentityDAL as never,
    membershipIdentityService: { removeIdentityFromOrg },
    membershipRoleDAL: {} as never,
    identityProjectDAL: { findByIdentityId: vi.fn() } as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) }),
      getOrgPermissionByRoles: vi.fn().mockResolvedValue([{ permission: createMongoAbility([]) }])
    } as never,
    licenseService: { getPlan: vi.fn(), getOrgSeatUsage: vi.fn(), updateSubscriptionOrgMemberCount: vi.fn() } as never,
    keyStore: { sortedSetRangeByScore: vi.fn().mockResolvedValue([]) } as never,
    orgDAL: {
      findById: vi.fn().mockResolvedValue({ id: ORG_ID, shouldUseNewPrivilegeSystem: false }),
      findEffectiveOrgMembership: vi.fn().mockResolvedValue({ id: "membership-1", scopeOrgId: ORG_ID })
    } as never,
    usageMeteringService: { emit: vi.fn() } as never,
    alertService: { deleteAlertsForDeletedResource } as never,
    identityAccessTokenService: {
      insertIdentityWideRevocationMarker: vi.fn().mockResolvedValue(undefined),
      bumpIdentityRevocationVersion: vi.fn().mockResolvedValue(undefined)
    } as never
  });

  return { service, identityDAL, deleteAlertsForDeletedResource, removeIdentityFromOrg };
};

describe("deleteIdentity sub-org removal", () => {
  beforeEach(() => vi.clearAllMocks());

  test("removing an identity that belongs to another org takes the same path as removing its membership", async () => {
    const { service, identityDAL, removeIdentityFromOrg } = createService({ identityOrgId: ROOT_ORG_ID });

    await service.deleteIdentity(buildDto());

    expect(removeIdentityFromOrg).toHaveBeenCalledWith({ identityId: IDENTITY_ID, orgId: ORG_ID });
    expect(identityDAL.deleteById).not.toHaveBeenCalled();
  });

  test("deleting the identity row leaves the membership service alone", async () => {
    const { service, removeIdentityFromOrg } = createService();

    await service.deleteIdentity(buildDto());

    expect(removeIdentityFromOrg).not.toHaveBeenCalled();
  });
});

describe("deleteIdentity alert cleanup", () => {
  beforeEach(() => vi.clearAllMocks());

  test("deleting the identity row reaps its alerts in every org, in the same transaction", async () => {
    const { service, identityDAL, deleteAlertsForDeletedResource } = createService();

    await service.deleteIdentity(buildDto());

    // alerts.resourceId has no FK, and the identity can have been watched from a child org it was
    // invited into, so the reap must not be filtered by org.
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledTimes(1);
    expect(deleteAlertsForDeletedResource).toHaveBeenCalledWith(
      { resourceType: RESOURCE_TYPE, resourceId: IDENTITY_ID },
      TX
    );
    // Same tx as the row delete: the alerts come back if the delete rolls back.
    expect(identityDAL.deleteById).toHaveBeenCalledWith(IDENTITY_ID, TX);
  });

  test("delete protection stops the delete before anything is reaped", async () => {
    const { service, deleteAlertsForDeletedResource } = createService({ hasDeleteProtection: true });

    await expect(service.deleteIdentity(buildDto())).rejects.toThrow("Identity has delete protection");

    expect(deleteAlertsForDeletedResource).not.toHaveBeenCalled();
  });
});

describe("updateIdentity name check", () => {
  const SOFT_HYPHEN = String.fromCharCode(0xad);
  const LEGACY_NAME = `ci${SOFT_HYPHEN}bot`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("an unchanged name is let through even if it predates the rule", async () => {
    const { service, identityDAL } = createService({ identityName: LEGACY_NAME });

    await service.updateIdentity({ ...buildDto(), name: LEGACY_NAME, hasDeleteProtection: true } as never);

    expect(identityDAL.updateById).toHaveBeenCalledWith(
      IDENTITY_ID,
      { name: LEGACY_NAME, hasDeleteProtection: true },
      TX
    );
  });

  test("a rename to an unsafe name is refused", async () => {
    const { service, identityDAL } = createService();

    await expect(service.updateIdentity({ ...buildDto(), name: LEGACY_NAME } as never)).rejects.toThrow(
      "Value cannot contain control, escape, bidirectional or zero-width characters"
    );

    expect(identityDAL.updateById).not.toHaveBeenCalled();
  });

  test("an unchanged empty name is let through", async () => {
    const { service, identityDAL } = createService({ identityName: "" });

    await service.updateIdentity({ ...buildDto(), name: "", hasDeleteProtection: true } as never);

    expect(identityDAL.updateById).toHaveBeenCalledWith(IDENTITY_ID, { name: "", hasDeleteProtection: true }, TX);
  });

  test("an empty name on its own is ignored, as before", async () => {
    const { service, identityDAL } = createService();

    await service.updateIdentity({ ...buildDto(), name: "" } as never);

    expect(identityDAL.updateById).not.toHaveBeenCalled();
  });
});
