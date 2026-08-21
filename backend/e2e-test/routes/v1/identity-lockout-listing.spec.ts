import { randomUUID } from "node:crypto";

import { IdentityAuthMethod, OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

type TIdentityMembershipsResponse = {
  identityMemberships: { identity: { id: string; activeLockoutAuthMethods: string[] } }[];
};

type TIdentityMembershipResponse = {
  identity: { identity: { id: string; activeLockoutAuthMethods: string[] } };
};

// The seeded project is shared with every other spec in the suite, and the suite runs in path
// order on one database. Both tests here therefore create their own identity and read it back by
// name, so neither can be reddened by an identity another spec left behind, and neither can pass
// by asserting over an empty page.
const createProjectIdentityWithUniversalAuth = async (name: string) => {
  const createRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/identities",
    body: {
      name,
      role: OrgMembershipRole.Admin,
      organizationId: seedData1.organization.id
    },
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

  const membershipRes = await testServer.inject({
    method: "POST",
    url: `/api/v1/projects/${seedData1.project.id}/memberships/identities/${identity.id}`,
    body: { roles: [{ role: ProjectMembershipRole.Member }] },
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(membershipRes.statusCode).toBe(200);

  return { identityId: identity.id as string, clientId: attachRes.json().identityUniversalAuth.clientId as string };
};

const deleteIdentity = (identityId: string) =>
  testServer.inject({
    method: "DELETE",
    url: `/api/v1/identities/${identityId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

const findListedIdentity = async (identityName: string, identityId: string) => {
  const listRes = await testServer.inject({
    method: "GET",
    url: `/api/v1/projects/${seedData1.project.id}/memberships/identities?identityName=${identityName}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });
  expect(listRes.statusCode).toBe(200);
  const { identityMemberships } = JSON.parse(listRes.payload) as TIdentityMembershipsResponse;
  return identityMemberships.find((m) => m.identity.id === identityId);
};

describe("Project identity listing lockout indicators", async () => {
  test("reports an active universal auth lockout and hides the client id", async () => {
    const identityName = `lockout-listing-locked-${randomUUID().slice(0, 8)}`;
    let identityId: string | undefined;
    let failure: Error | undefined;

    try {
      const created = await createProjectIdentityWithUniversalAuth(identityName);
      identityId = created.identityId;

      const secretRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/auth/universal-auth/identities/${identityId}/client-secrets`,
        body: { description: "test" },
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(secretRes.statusCode).toBe(200);

      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await testServer.inject({
          method: "POST",
          url: "/api/v1/auth/universal-auth/login",
          body: { clientId: created.clientId, clientSecret: "definitely-the-wrong-secret" }
        });
      }

      const row = await findListedIdentity(identityName, identityId);
      expect(row).toBeDefined();
      expect(row?.identity.activeLockoutAuthMethods).toContain(IdentityAuthMethod.UNIVERSAL_AUTH);
      expect(row?.identity).not.toHaveProperty("universalAuthClientId");

      // The org detail route resolves the same lockout by exact key off the same new column, so it
      // has to agree with the list and must not serialise the client id either.
      const detailRes = await testServer.inject({
        method: "GET",
        url: `/api/v1/identities/${identityId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(detailRes.statusCode).toBe(200);
      const detail = (JSON.parse(detailRes.payload) as TIdentityMembershipResponse).identity.identity;
      expect(detail.activeLockoutAuthMethods).toContain(IdentityAuthMethod.UNIVERSAL_AUTH);
      expect(detail).not.toHaveProperty("universalAuthClientId");
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (identityId) {
        const deleteRes = await deleteIdentity(identityId);
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
    const identityName = `lockout-listing-clean-${randomUUID().slice(0, 8)}`;
    let identityId: string | undefined;
    let failure: Error | undefined;

    try {
      const created = await createProjectIdentityWithUniversalAuth(identityName);
      identityId = created.identityId;

      const row = await findListedIdentity(identityName, identityId);
      expect(row).toBeDefined();
      expect(row?.identity.activeLockoutAuthMethods).toEqual([]);
    } catch (err) {
      failure = err instanceof Error ? err : new Error(String(err));
    } finally {
      if (identityId) {
        const deleteRes = await deleteIdentity(identityId);
        if (!failure && deleteRes.statusCode !== 200) {
          failure = new Error(`cleanup DELETE /api/v1/identities/${identityId} returned ${deleteRes.statusCode}`);
        }
      }
    }

    if (failure) {
      throw failure;
    }
  });
});
