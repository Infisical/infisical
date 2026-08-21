import { IdentityAuthMethod, OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

type TIdentityMembershipsResponse = {
  identityMemberships: { identity: { id: string; activeLockoutAuthMethods: string[] } }[];
};

describe("Project identity listing lockout indicators", async () => {
  test("reports an active universal auth lockout and hides the client id", async () => {
    let identityId: string | undefined;
    let failure: Error | undefined;

    try {
      const createRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/identities",
        body: {
          name: "lockout-listing-mi",
          role: OrgMembershipRole.Admin,
          organizationId: seedData1.organization.id
        },
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(createRes.statusCode).toBe(200);
      const { identity } = createRes.json();
      identityId = identity.id;

      const attachRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/auth/universal-auth/identities/${identity.id}`,
        body: { lockoutEnabled: true, lockoutThreshold: 3, lockoutDurationSeconds: 300 },
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(attachRes.statusCode).toBe(200);
      const { clientId } = attachRes.json().identityUniversalAuth;

      const membershipRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/projects/${seedData1.project.id}/memberships/identities/${identity.id}`,
        body: { roles: [{ role: ProjectMembershipRole.Member }] },
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(membershipRes.statusCode).toBe(200);

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

      const { identityMemberships } = JSON.parse(listRes.payload) as TIdentityMembershipsResponse;
      const row = identityMemberships.find((m) => m.identity.id === identity.id);
      expect(row).toBeDefined();
      expect(row?.identity.activeLockoutAuthMethods).toContain(IdentityAuthMethod.UNIVERSAL_AUTH);
      expect(row?.identity).not.toHaveProperty("universalAuthClientId");
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (identityId) {
        const deleteRes = await testServer.inject({
          method: "DELETE",
          url: `/api/v1/identities/${identityId}`,
          headers: { authorization: `Bearer ${jwtAuthToken}` }
        });
        // Only report a cleanup failure when nothing else already failed, so it never
        // masks the assertion this test exists to catch.
        if (!failure && deleteRes.statusCode !== 200) {
          failure = new Error(`cleanup DELETE /api/v1/identities/${identityId} returned ${deleteRes.statusCode}`);
        }
      }
    }

    if (failure) {
      throw failure;
    }
  });

  test("reports no lockout for an identity that has never failed a login", async () => {
    const listRes = await testServer.inject({
      method: "GET",
      url: `/api/v1/projects/${seedData1.project.id}/memberships/identities?limit=100`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(listRes.statusCode).toBe(200);
    const { identityMemberships } = JSON.parse(listRes.payload) as TIdentityMembershipsResponse;
    identityMemberships.forEach((m) => {
      expect(m.identity.activeLockoutAuthMethods).toEqual([]);
    });
  });
});
