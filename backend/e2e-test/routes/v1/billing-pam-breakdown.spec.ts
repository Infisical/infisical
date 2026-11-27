import { createIsolatedOrgAndProject } from "../../testUtils/fixtures";
import { createIdentityActor } from "../../testUtils/identities";

const readPamBreakdown = (authToken: string, orgId: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/organizations/${orgId}/billing/v2/breakdowns/pam_identities`,
    headers: { authorization: `Bearer ${authToken}` }
  });

describe("PAM identities usage breakdown", () => {
  let org: Awaited<ReturnType<typeof createIsolatedOrgAndProject>>;

  beforeEach(async () => {
    org = await createIsolatedOrgAndProject("billing-pam");
  });

  afterEach(async () => {
    await org.cleanup();
  });

  test("should count a machine identity added to PAM at its org, with no project detail", async () => {
    // Setup
    const before = (await readPamBreakdown(org.authToken, org.orgId)).json().breakdown;
    const { identityId } = await createIdentityActor({ orgId: org.orgId, authToken: org.authToken });
    const added = await testServer.inject({
      method: "POST",
      url: `/api/v1/pam/memberships/identities/${identityId}`,
      headers: { authorization: `Bearer ${org.authToken}` },
      body: { role: "member" }
    });
    expect(added.statusCode).toBe(200);

    // Action
    const res = await readPamBreakdown(org.authToken, org.orgId);

    // Assert
    expect(res.statusCode).toBe(200);
    const { breakdown } = res.json();
    expect(breakdown).toMatchObject({
      dimensionKey: "pam_identities",
      total: before.total + 1,
      scopedCount: before.scopedCount + 1,
      hasProjectDetail: false,
      unit: "PAM identity"
    });
    expect(breakdown.scopes).toEqual([
      expect.objectContaining({ orgId: org.orgId, isRoot: true, count: 1, orgLevelCount: 1, projects: [] })
    ]);
  });
});
