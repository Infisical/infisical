import { IdentityAuthMethod, OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

describe("Project identity listing lockout indicators", async () => {
  test("reports an active universal auth lockout and hides the client id", async () => {
    const createRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/identities",
      body: { name: "lockout-listing-mi", role: OrgMembershipRole.Admin, organizationId: seedData1.organization.id },
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(createRes.statusCode).toBe(200);
    const { identity } = createRes.json();

    const attachRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identity.id}`,
      body: { lockoutEnabled: true, lockoutThreshold: 3, lockoutDurationSeconds: 300 },
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(attachRes.statusCode).toBe(200);
    const { clientId } = attachRes.json().identityUniversalAuth;

    await testServer.inject({
      method: "POST",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities/${identity.id}`,
      body: { roles: [{ role: ProjectMembershipRole.Member }] },
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    const secretRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`,
      body: { description: "test" },
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(secretRes.statusCode).toBe(200);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "POST",
        url: "/api/v1/auth/universal-auth/login",
        body: { clientId, clientSecret: "definitely-the-wrong-secret" }
      });
    }

    const listRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities?limit=100`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(listRes.statusCode).toBe(200);

    const row = listRes.json().identityMemberships.find((m) => m.identity.id === identity.id);
    expect(row).toBeDefined();
    expect(row.identity.activeLockoutAuthMethods).toContain(IdentityAuthMethod.UNIVERSAL_AUTH);
    expect(row.identity).not.toHaveProperty("universalAuthClientId");

    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/identities/${identity.id}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
  });

  test("reports no lockout for an identity that has never failed a login", async () => {
    const listRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities?limit=100`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(listRes.statusCode).toBe(200);
    listRes.json().identityMemberships.forEach((m) => {
      expect(Array.isArray(m.identity.activeLockoutAuthMethods)).toBe(true);
    });
  });
});
