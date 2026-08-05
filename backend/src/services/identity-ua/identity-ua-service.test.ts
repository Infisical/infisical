import { AbilityBuilder, createMongoAbility, MongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { conditionsMatcher } from "@app/lib/casl";

import { identityUaServiceFactory } from "./identity-ua-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({})
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const IDENTITY_ID = "identity-id";
const ORG_ID = "org-id";
const ACTOR_ID = "actor-id";

const TTL_ERROR = "Access token TTL cannot be greater than max TTL";

const HOUR = 3600;
const WEEK = 604800;
const MONTH = 2592000;

const buildOrgEditAbility = () => {
  const builder = new AbilityBuilder<MongoAbility<OrgPermissionSet>>(createMongoAbility);
  builder.can(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
  return builder.build({ conditionsMatcher });
};

/**
 * Builds the service with only the dependencies `updateUniversalAuth` touches.
 * `storedTTL` / `storedMaxTTL` are what the identity already has persisted.
 */
const setup = ({ storedTTL, storedMaxTTL }: { storedTTL: number; storedMaxTTL: number }) => {
  const identityUaDAL = {
    findOne: vi.fn().mockResolvedValue({
      id: "ua-id",
      identityId: IDENTITY_ID,
      accessTokenTTL: storedTTL,
      accessTokenMaxTTL: storedMaxTTL
    }),
    updateById: vi
      .fn()
      .mockImplementation((id: string, row: Record<string, unknown>) =>
        Promise.resolve({ id, identityId: IDENTITY_ID, ...row })
      )
  };

  const membershipIdentityDAL = {
    getIdentityById: vi.fn().mockResolvedValue({
      scopeOrgId: ORG_ID,
      identity: {
        id: IDENTITY_ID,
        orgId: ORG_ID,
        projectId: null,
        authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH]
      }
    })
  };

  const permissionService = {
    getOrgPermission: vi.fn().mockResolvedValue({ permission: buildOrgEditAbility() }),
    getProjectPermission: vi.fn()
  };

  const licenseService = { getPlan: vi.fn().mockResolvedValue({ ipAllowlisting: true }) };
  const identityAccessTokenService = { invalidateTrustedIpsCache: vi.fn().mockResolvedValue(undefined) };

  const service = identityUaServiceFactory({
    identityDAL: { findById: vi.fn() },
    identityUaDAL,
    identityUaClientSecretDAL: {},
    membershipIdentityDAL,
    permissionService,
    licenseService,
    orgDAL: { findById: vi.fn(), findOne: vi.fn(), findEffectiveOrgMembership: vi.fn() },
    identityAccessTokenService,
    keyStore: {}
  } as unknown as Parameters<typeof identityUaServiceFactory>[0]);

  return { service, identityUaDAL };
};

const update = (
  service: ReturnType<typeof identityUaServiceFactory>,
  patch: { accessTokenTTL?: number; accessTokenMaxTTL?: number }
) =>
  service.updateUniversalAuth({
    identityId: IDENTITY_ID,
    actorId: ACTOR_ID,
    actorOrgId: ORG_ID,
    ...patch
  } as unknown as Parameters<typeof service.updateUniversalAuth>[0]);

describe("updateUniversalAuth access token TTL validation", () => {
  beforeEach(() => vi.clearAllMocks());

  test("lowering only accessTokenMaxTTL is accepted when the stored TTL still fits", async () => {
    // stored: TTL 1h, maxTTL 30d. Request lowers maxTTL to 7d and omits TTL.
    // 1h < 7d, so this is valid. Regression test: the fallback used to read the
    // stored accessTokenMaxTTL (30d) instead of the stored accessTokenTTL (1h),
    // which made 30d > 7d and rejected a legitimate update.
    const { service, identityUaDAL } = setup({ storedTTL: HOUR, storedMaxTTL: MONTH });

    await expect(update(service, { accessTokenMaxTTL: WEEK })).resolves.toBeDefined();
    expect(identityUaDAL.updateById).toHaveBeenCalledWith(
      "ua-id",
      expect.objectContaining({ accessTokenMaxTTL: WEEK })
    );
  });

  test("lowering accessTokenMaxTTL below the stored TTL is still rejected", async () => {
    // stored: TTL 1h. Request lowers maxTTL to 60s, which is below the stored TTL.
    const { service } = setup({ storedTTL: HOUR, storedMaxTTL: MONTH });

    await expect(update(service, { accessTokenMaxTTL: 60 })).rejects.toThrow(TTL_ERROR);
  });

  test("an explicit TTL greater than an explicit max TTL is still rejected", async () => {
    const { service } = setup({ storedTTL: HOUR, storedMaxTTL: MONTH });

    await expect(update(service, { accessTokenTTL: 7200, accessTokenMaxTTL: HOUR })).rejects.toThrow(TTL_ERROR);
  });

  test("a max TTL of 0 means unlimited and skips the comparison", async () => {
    const { service } = setup({ storedTTL: HOUR, storedMaxTTL: 0 });

    await expect(update(service, { accessTokenTTL: MONTH })).resolves.toBeDefined();
  });
});
