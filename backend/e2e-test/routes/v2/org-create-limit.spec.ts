import { AccessScope, OrgMembershipStatus, TableName, TOrganizationsInsert } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { getConfig, overrideEnvConfig } from "@app/lib/config/env";
import { orgDALFactory } from "@app/services/org/org-dal";

import { loginUser, selectOrg } from "../../testUtils/auth";

const orgDAL = orgDALFactory(testDb);

const countCreatedOrgs = () => orgDAL.countJoinedRootOrgsCreatedByUserId(seedData1.id, testDb);

// Anything left behind would carry into the next test's count and blame the wrong one.
const createdOrgIds: string[] = [];

const track = (orgId: string) => {
  createdOrgIds.push(orgId);
  return orgId;
};

const createOrgRequest = (name: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v2/organizations",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { name }
  });

const createOrgOverHttp = async (name: string) => {
  const res = await createOrgRequest(name);
  expect(res.statusCode).toBe(200);
  return track(res.json().organization.id as string);
};

const deleteOrgOverHttp = async (orgId: string) => {
  const { accessToken } = await loginUser(seedData1.email, seedData1.password);
  const { payload } = await selectOrg(accessToken, orgId);
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/organizations/${orgId}`,
    headers: { authorization: `Bearer ${payload.token}` }
  });
  expect(res.statusCode).toBe(200);
};

const cleanupTrackedOrgs = async () => {
  const ids = createdOrgIds.splice(0);
  if (ids.length) await testDb(TableName.Organization).whereIn("id", ids).delete();
};

describe("Organizations counted against a user's create limit", () => {
  const insertOrg = async (fields: TOrganizationsInsert) => {
    const [org] = await testDb(TableName.Organization).insert(fields).returning("*");
    return track(org.id);
  };

  afterEach(cleanupTrackedOrgs);

  // The seeded org carries no createdByUserId, the shape every org predating the column has.
  test("an org the user only belongs to does not count", async () => {
    await expect(countCreatedOrgs()).resolves.toBe(0);
  });

  test("an org the user created counts until it is deleted", async () => {
    const orgId = await createOrgOverHttp("org-limit-created");

    await expect(countCreatedOrgs()).resolves.toBe(1);

    await deleteOrgOverHttp(orgId);
    await expect(countCreatedOrgs()).resolves.toBe(0);
  });

  test("an org the user created but does not belong to does not count", async () => {
    await insertOrg({ name: "org-limit-orphan", slug: "org-limit-orphan", createdByUserId: seedData1.id });

    await expect(countCreatedOrgs()).resolves.toBe(0);
  });

  // SCIM sets isActive from the IdP's active flag without touching status, so a deactivated creator
  // would otherwise hold a slot in an org they cannot use.
  test("an org the user is deactivated in does not count", async () => {
    const orgId = await insertOrg({
      name: "org-limit-deactivated",
      slug: "org-limit-deactivated",
      createdByUserId: seedData1.id
    });
    await testDb(TableName.Membership).insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: seedData1.id,
      isActive: false,
      status: OrgMembershipStatus.Accepted
    });

    await expect(countCreatedOrgs()).resolves.toBe(0);
  });

  test("a sub-org does not count", async () => {
    const rootId = await insertOrg({ name: "org-limit-root", slug: "org-limit-root" });
    const subId = await insertOrg({
      name: "org-limit-sub",
      slug: "org-limit-sub",
      rootOrgId: rootId,
      parentOrgId: rootId,
      createdByUserId: seedData1.id
    });
    await testDb(TableName.Membership).insert({
      scope: AccessScope.Organization,
      scopeOrgId: subId,
      actorUserId: seedData1.id,
      isActive: true,
      status: OrgMembershipStatus.Accepted
    });

    await expect(countCreatedOrgs()).resolves.toBe(0);
  });

  test("the route does not refuse a second org off cloud", async () => {
    const first = await createOrgOverHttp("org-limit-off-cloud-first");
    const second = await createOrgOverHttp("org-limit-off-cloud-second");

    await deleteOrgOverHttp(second);
    await deleteOrgOverHttp(first);
  });
});

// The limit only engages on cloud, and this environment is not cloud. Re-parsing the env with the
// license server key set is the only way to reach the refusal, so the suite would otherwise cover
// everything around it and nothing that does the refusing. The flip reaches only code calling
// getConfig() per request: instanceType and the license service's envConfig were both captured at
// boot, so no license-server call becomes live.
describe("The create-organization route on cloud", () => {
  beforeAll(() => {
    process.env.LICENSE_SERVER_V2_SERVICE_KEY = "e2e-cloud";
    overrideEnvConfig({});
    expect(getConfig().isCloud).toBe(true);
  });

  afterAll(async () => {
    delete process.env.LICENSE_SERVER_V2_SERVICE_KEY;
    overrideEnvConfig({});
    expect(getConfig().isCloud).toBe(false);
    await cleanupTrackedOrgs();
  });

  // Deleted straight from the database rather than over HTTP, since the delete route's cloud branch
  // would reach a license server this environment does not run.
  afterEach(cleanupTrackedOrgs);

  test("a second org is refused with 409", async () => {
    await createOrgOverHttp("org-limit-cloud-first");

    const res = await createOrgRequest("org-limit-cloud-second");

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/already created an organization/);
  });

  test("concurrent creates land exactly one org", async () => {
    const results = await Promise.all([
      createOrgRequest("org-limit-cloud-race-a"),
      createOrgRequest("org-limit-cloud-race-b")
    ]);

    const statuses = results.map((res) => res.statusCode).sort();
    expect(statuses).toEqual([200, 409]);

    results.filter((res) => res.statusCode === 200).forEach((res) => track(res.json().organization.id as string));
    await expect(countCreatedOrgs()).resolves.toBe(1);
  });
});
