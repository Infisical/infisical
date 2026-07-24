import { createMongoAbility } from "@casl/ability";
import { Knex } from "knex";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AccessScope } from "@app/db/schemas";

import { membershipIdentityServiceFactory } from "./membership-identity-service";
import { TDeleteMembershipIdentityDTO } from "./membership-identity-types";

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

const createService = () => {
  const bumpIdentityRevocationVersion = vi.fn().mockResolvedValue(undefined);
  const insertOrgMembershipRevocationMarker = vi.fn().mockResolvedValue(undefined);

  const membershipIdentityDAL = {
    findOne: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID, actorIdentityId: IDENTITY_ID }),
    deleteById: vi.fn().mockResolvedValue({ id: MEMBERSHIP_ID }),
    transaction: vi.fn(async (cb: (tx: Knex) => Promise<unknown>) => cb({} as Knex))
  };

  const service = membershipIdentityServiceFactory({
    membershipIdentityDAL: membershipIdentityDAL as never,
    roleDAL: { find: vi.fn() } as never,
    membershipRoleDAL: { delete: vi.fn().mockResolvedValue(undefined), insertMany: vi.fn() } as never,
    permissionService: {
      getOrgPermission: vi
        .fn()
        .mockResolvedValue({ permission: createMongoAbility([{ action: "manage", subject: "all" }]) })
    } as never,
    orgDAL: { findById: vi.fn(), findEffectiveOrgMembership: vi.fn() } as never,
    additionalPrivilegeDAL: { delete: vi.fn().mockResolvedValue(undefined) } as never,
    identityDAL: {
      findById: vi.fn().mockResolvedValue({ orgId: ROOT_ORG_ID, projectId: null })
    } as never,
    licenseService: { getPlan: vi.fn() } as never,
    applicationMembershipCleanupService: { cleanupActorApplicationMemberships: vi.fn() } as never,
    projectDAL: { findById: vi.fn() } as never,
    keyStore: { getKeysByPattern: vi.fn(), getItem: vi.fn() } as never,
    usageMeteringService: { emit: vi.fn(), emitForProject: vi.fn() } as never,
    identityAccessTokenService: {
      insertOrgMembershipRevocationMarker,
      bumpIdentityRevocationVersion
    } as never
  });

  return { service, membershipIdentityDAL, bumpIdentityRevocationVersion, insertOrgMembershipRevocationMarker };
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
