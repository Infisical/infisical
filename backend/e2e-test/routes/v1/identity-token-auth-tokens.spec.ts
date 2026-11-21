import { OrgMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";

const adminHeaders = () => ({ authorization: `Bearer ${jwtAuthToken}` });

describe("Token Auth token listing", () => {
  let identityId: string;

  beforeAll(async () => {
    const identityRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/identities",
      headers: adminHeaders(),
      body: { name: "token-auth-list", role: OrgMembershipRole.NoAccess, organizationId: seedData1.organization.id }
    });
    expect(identityRes.statusCode).toBe(200);
    identityId = identityRes.json().identity.id as string;

    const attachRes = await testServer.inject({
      method: "POST",
      url: `/api/v1/auth/token-auth/identities/${identityId}`,
      headers: adminHeaders(),
      body: { accessTokenTTL: 2592000, accessTokenMaxTTL: 2592000, accessTokenNumUsesLimit: 0 }
    });
    expect(attachRes.statusCode).toBe(200);

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const tokenRes = await testServer.inject({
        method: "POST",
        url: `/api/v1/auth/token-auth/identities/${identityId}/tokens`,
        headers: adminHeaders(),
        body: { name: `token-${i}` }
      });
      expect(tokenRes.statusCode).toBe(200);
    }
  });

  afterAll(async () => {
    await testServer.inject({ method: "DELETE", url: `/api/v1/identities/${identityId}`, headers: adminHeaders() });
  });

  test("returns the total count alongside a page of tokens", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/auth/token-auth/identities/${identityId}/tokens?offset=0&limit=2`,
      headers: adminHeaders()
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tokens).toHaveLength(2);
    expect(body.totalCount).toBe(3);
  });

  test("accepts an offset above 100", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `/api/v1/auth/token-auth/identities/${identityId}/tokens?offset=150&limit=10`,
      headers: adminHeaders()
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tokens).toHaveLength(0);
    expect(body.totalCount).toBe(3);
  });
});
