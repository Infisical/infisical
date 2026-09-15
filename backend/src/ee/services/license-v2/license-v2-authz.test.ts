import { ForbiddenRequestError } from "@app/lib/errors";

import { licenseV2ServiceFactory } from "./license-v2-service";

// The helper reads @fastify/request-context, which has no store outside a request. Mocking the
// module keeps the helper's own logic under test while letting each case choose what a request
// would have carried.
const contextStore = new Map<string, unknown>();
vi.mock("@fastify/request-context", () => ({
  requestContext: {
    get: (key: string) => contextStore.get(key),
    set: (key: string, value: unknown) => contextStore.set(key, value)
  }
}));

const ROOT_ORG = "11111111-1111-1111-1111-111111111111";
const OTHER_ORG = "22222222-2222-2222-2222-222222222222";

const actor = {
  id: "user-1",
  type: "user",
  orgId: ROOT_ORG,
  authMethod: "email"
} as Parameters<ReturnType<typeof licenseV2ServiceFactory>["getBillableOrganizations"]>[0]["actor"];

const buildService = () => {
  const getOrgPermission = vi.fn(async () => {
    // Stands in for a caller with no membership in the org being asked about, which is what a
    // cross-org request resolves to once the shortcut no longer applies.
    throw new ForbiddenRequestError({ message: "You are not a member of this organization" });
  });

  const service = licenseV2ServiceFactory({
    envConfig: { isCloud: false, SITE_URL: "http://localhost" },
    orgDAL: { findById: vi.fn(async () => ({ id: OTHER_ORG, name: "Other" })) },
    permissionService: { getOrgPermission },
    licenseDAL: {
      countBillableOrgActors: vi.fn(async () => ({ users: 0, identities: 0 })),
      getBillableIdentityOwnershipBreakdown: vi.fn(async () => [])
    },
    usageCounterDAL: {
      resolveRootOrgId: vi.fn(async (id: string) => id),
      countProjectIdentitiesByKindFor: vi.fn(async () => ({ users: 0, identities: 0 })),
      getProjectIdentityBreakdown: vi.fn(async () => []),
      getInternalCaOrgBreakdown: vi.fn(async () => []),
      getActiveCertificateOrgBreakdown: vi.fn(async () => [])
    },
    breakdownDAL: {
      findOrgTreeNames: vi.fn(async () => []),
      findProjectNames: vi.fn(async () => []),
      findAllRootOrgs: vi.fn(async () => ({ orgs: [{ id: ROOT_ORG, name: "Root" }], totalCount: 1 }))
    },
    meteredFeatures: [],
    licenseClient: {}
  } as unknown as Parameters<typeof licenseV2ServiceFactory>[0]);

  return { service, getOrgPermission };
};

describe("billing v2 cross-org read shortcut", () => {
  beforeEach(() => {
    contextStore.clear();
  });

  test("a first-party instance admin reads another org without a membership check", async () => {
    const { service, getOrgPermission } = buildService();

    const result = await service.getBillableOrganizations({
      orgId: OTHER_ORG,
      actor,
      isInstanceAdmin: true,
      limit: 10,
      offset: 0
    });

    expect(getOrgPermission).not.toHaveBeenCalled();
    expect(result.totalCount).toBe(1);
  });

  test("a fully delegated OAuth token keeps the shortcut", async () => {
    // inject-identity leaves OauthScopes unset for full delegation, exactly as for a first-party
    // session, so full delegation is matched positively rather than inferred from its absence.
    const { service, getOrgPermission } = buildService();

    await service.getBillableOrganizations({
      orgId: OTHER_ORG,
      actor,
      isInstanceAdmin: true,
      limit: 10,
      offset: 0
    });

    expect(getOrgPermission).not.toHaveBeenCalled();
  });

  test("a scope-narrowed OAuth token is denied the shortcut and checked instead", async () => {
    contextStore.set("oauthScopes", ["secrets:read"]);
    const { service, getOrgPermission } = buildService();

    await expect(
      service.getBillableOrganizations({
        orgId: OTHER_ORG,
        actor,
        isInstanceAdmin: true,
        limit: 10,
        offset: 0
      })
    ).rejects.toThrow(ForbiddenRequestError);

    // The check is the point: it is where permission-service intersects the granted scopes.
    expect(getOrgPermission).toHaveBeenCalledTimes(1);
  });

  test("an empty scope list is still a narrowed token, not an absent one", async () => {
    contextStore.set("oauthScopes", []);
    const { service, getOrgPermission } = buildService();

    await expect(
      service.getBillableOrganizations({
        orgId: OTHER_ORG,
        actor,
        isInstanceAdmin: true,
        limit: 10,
        offset: 0
      })
    ).rejects.toThrow(ForbiddenRequestError);
    expect(getOrgPermission).toHaveBeenCalledTimes(1);
  });

  test("the breakdown endpoint is guarded by the same predicate", async () => {
    contextStore.set("oauthScopes", ["secrets:read"]);
    const { service, getOrgPermission } = buildService();

    await expect(
      service.getUsageBreakdown({
        orgId: OTHER_ORG,
        actor,
        isInstanceAdmin: true,
        dimensionKey: "identities"
      })
    ).rejects.toThrow(ForbiddenRequestError);
    expect(getOrgPermission).toHaveBeenCalledTimes(1);
  });
});
