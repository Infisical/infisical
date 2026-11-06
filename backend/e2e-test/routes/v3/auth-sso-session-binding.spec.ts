import crypto from "node:crypto";

import { decode } from "jsonwebtoken";
import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AuthMethod, ProviderAuthResult } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

import { loginUser, selectOrg } from "../../testUtils/auth";
import { cleanupEmailDomains, seedVerifiedEmailDomain } from "../../testUtils/email-domains";

const ORG_A_ID = seedData1.organization.id;
const ORG_A_DOMAIN = "binding-org-a.local";
const ORG_B_DOMAIN = "binding-org-b.local";
const REDIRECT_URI = "https://app.example.com/callback";

const getDb = () => (globalThis as unknown as { testDb: Knex }).testDb;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getServices = () => (globalThis as any).testServices;

const decodeClaims = (token: string) => decode(token) as { authMethod?: string; issuingRootOrgId?: string };

// An SSO session is bound to the root org whose IdP issued it: enforced orgs admit only sessions
// their own IdP minted, while non-enforced orgs and the issuing org keep today's rules.
describe("Auth SSO session binding", () => {
  let orgBId: string;
  const createdUserIds: string[] = [];
  const createdClientIds: string[] = [];

  const setAuthEnforced = (orgId: string, authEnforced: boolean) =>
    getDb()(TableName.Organization).where({ id: orgId }).update({ authEnforced });

  // Org B enforces SSO, so its IdP login skips mailbox verification and mints a session directly.
  const loginThroughOrgBIdp = async () => {
    const result = await getServices().saml.samlLogin({
      externalId: `binding-${crypto.randomUUID()}`,
      email: `member-${crypto.randomUUID()}@${ORG_B_DOMAIN}`,
      firstName: "Bound",
      lastName: "Session",
      authProvider: AuthMethod.OKTA_SAML,
      orgId: orgBId,
      ip: "127.0.0.1",
      userAgent: "test-agent"
    });
    createdUserIds.push(result.userId);
    if (result.result !== ProviderAuthResult.SESSION) {
      throw new Error(`Expected a session from the enforced org's IdP, got ${result.result}`);
    }
    return { userId: result.userId as string, tokens: result.tokens as { access: string; refresh: string } };
  };

  const addMemberToOrgA = async (userId: string) => {
    const db = getDb();
    const [membership] = await db(TableName.Membership)
      .insert({
        scope: AccessScope.Organization,
        actorUserId: userId,
        scopeOrgId: ORG_A_ID,
        status: OrgMembershipStatus.Accepted,
        isActive: true
      })
      .returning("*");
    await db(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Member });
  };

  beforeAll(async () => {
    const db = getDb();
    await seedVerifiedEmailDomain(ORG_A_ID, ORG_A_DOMAIN, db);

    const [orgB] = await db(TableName.Organization)
      .insert({ name: "Session Binding Org B", slug: `binding-org-b-${crypto.randomUUID().slice(0, 8)}` })
      .returning("*");
    orgBId = orgB.id;
    await seedVerifiedEmailDomain(orgBId, ORG_B_DOMAIN, db);
    await setAuthEnforced(orgBId, true);
  });

  afterEach(async () => {
    await setAuthEnforced(ORG_A_ID, false);
    await Promise.all(
      createdClientIds.splice(0).map((id) =>
        testServer.inject({
          method: "DELETE",
          url: `/api/v1/oauth/clients/${id}`,
          headers: { authorization: `Bearer ${jwtAuthToken}` }
        })
      )
    );
  });

  afterAll(async () => {
    const db = getDb();
    if (createdUserIds.length > 0) {
      await db(TableName.UserAliases).whereIn("userId", createdUserIds).del();
      await db(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await db(TableName.Users).whereIn("id", createdUserIds).where("id", "!=", seedData1.id).del();
    }
    await cleanupEmailDomains(ORG_A_ID, db);
    await cleanupEmailDomains(orgBId, db);
    await db(TableName.Organization).where({ id: orgBId }).del();
  });

  test("An IdP login stamps the issuing root org on the pre-organization session", async () => {
    const { tokens } = await loginThroughOrgBIdp();

    expect(decodeClaims(tokens.access)).toMatchObject({
      authMethod: AuthMethod.OKTA_SAML,
      issuingRootOrgId: orgBId
    });
    expect(decodeClaims(tokens.refresh).issuingRootOrgId).toBe(orgBId);
  });

  test("A password login carries no issuing org", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    expect(decodeClaims(accessToken).issuingRootOrgId).toBeUndefined();
  });

  test("The issuing org admits its own IdP session and keeps the claim on the org-scoped token", async () => {
    const { tokens } = await loginThroughOrgBIdp();

    const { statusCode, payload } = await selectOrg(tokens.access, orgBId);

    expect(statusCode).toBe(200);
    expect(decodeClaims(payload.token)).toMatchObject({ organizationId: orgBId, issuingRootOrgId: orgBId });
  });

  test("Another org that enforces SSO refuses a session its IdP did not issue", async () => {
    const { userId, tokens } = await loginThroughOrgBIdp();
    await addMemberToOrgA(userId);
    await setAuthEnforced(ORG_A_ID, true);
    // Recorded at the call: the e2e plan keeps no audit logs, so none reach the audit_logs table.
    const auditLogSpy = vi.spyOn(getServices().auditLog, "createAuditLog");

    try {
      const { statusCode, payload } = await selectOrg(tokens.access, ORG_A_ID);

      expect(statusCode).toBe(403);
      expect(payload.message).toMatch(/another organization's identity provider/);

      const calls = auditLogSpy.mock.calls.map(([dto]) => dto as { orgId: string; actor: unknown; event: unknown });
      const refusals = calls.filter(
        ({ event }) => (event as { type: string }).type === EventType.SELECT_ORGANIZATION_REFUSED
      );
      expect(refusals).toHaveLength(1);
      expect(refusals[0]).toMatchObject({
        orgId: ORG_A_ID,
        actor: { metadata: { userId } },
        event: { metadata: { organizationId: ORG_A_ID, organizationName: seedData1.organization.name } }
      });
      // The refusal is recorded in the org that refused; nothing about the issuing org reaches its audit log.
      expect(JSON.stringify(refusals[0])).not.toContain(orgBId);
      expect(calls.some(({ event }) => (event as { type: string }).type === EventType.SELECT_ORGANIZATION)).toBe(false);
    } finally {
      auditLogSpy.mockRestore();
    }
  });

  test("A session another org's IdP issued stops working once the org starts enforcing SSO", async () => {
    const { userId, tokens } = await loginThroughOrgBIdp();
    await addMemberToOrgA(userId);
    const { payload: selected } = await selectOrg(tokens.access, ORG_A_ID);
    const listMemberships = () =>
      testServer.inject({
        method: "GET",
        url: `/api/v2/organizations/${ORG_A_ID}/memberships`,
        headers: { authorization: `Bearer ${selected.token}` }
      });
    expect((await listMemberships()).statusCode).toBe(200);

    await setAuthEnforced(ORG_A_ID, true);
    const refused = await listMemberships();

    expect(refused.statusCode).toBe(403);
    expect(refused.json().message).toMatch(/another organization's identity provider/);
  });

  test("A project read another org's IdP session already cached is refused once the org starts enforcing SSO", async () => {
    const created = await testServer.inject({
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { projectName: `binding-cache-${crypto.randomUUID().slice(0, 8)}` }
    });
    expect(created.statusCode).toBe(200);
    const projectId = created.json().project.id as string;

    try {
      const { userId, tokens } = await loginThroughOrgBIdp();
      await addMemberToOrgA(userId);
      const user = await getDb()(TableName.Users).where({ id: userId }).first();
      const added = await testServer.inject({
        method: "POST",
        url: `/api/v2/workspace/${projectId}/memberships`,
        headers: { authorization: `Bearer ${jwtAuthToken}` },
        body: { usernames: [user?.username], roleSlugs: ["member"] }
      });
      expect(added.statusCode).toBe(200);

      const { payload: selected } = await selectOrg(tokens.access, ORG_A_ID);
      const readProject = () =>
        testServer.inject({
          method: "GET",
          url: `/api/v1/projects/${projectId}`,
          headers: { authorization: `Bearer ${selected.token}` }
        });
      expect((await readProject()).statusCode).toBe(200);

      await setAuthEnforced(ORG_A_ID, true);
      // The project permission is still cached; enforcement must apply on the very next request.
      const markerKeys = await testRedis.keys(`*project-permission-marker:${projectId}:*`);
      expect(markerKeys.length).toBeGreaterThan(0);
      const refused = await readProject();

      expect(refused.statusCode).toBe(403);
      expect(refused.json().message).toMatch(/another organization's identity provider/);
    } finally {
      await setAuthEnforced(ORG_A_ID, false);
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/projects/${projectId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
    }
  });

  describe("Sub-organizations", () => {
    let subOrgId: string;

    const addMemberToSubOrg = async (userId: string, role: OrgMembershipRole) => {
      const db = getDb();
      const [membership] = await db(TableName.Membership)
        .insert({
          scope: AccessScope.Organization,
          actorUserId: userId,
          scopeOrgId: subOrgId,
          status: OrgMembershipStatus.Accepted,
          isActive: true
        })
        .returning("*");
      await db(TableName.MembershipRole).insert({ membershipId: membership.id, role });
    };

    // A session another org's IdP issued, already open in a sub-org of org A before A enforces SSO.
    const openSubOrgSession = async (subOrgRole: OrgMembershipRole) => {
      const { userId, tokens } = await loginThroughOrgBIdp();
      await addMemberToOrgA(userId);
      await addMemberToSubOrg(userId, subOrgRole);
      const { statusCode, payload } = await selectOrg(tokens.access, subOrgId);
      expect(statusCode).toBe(200);
      return () =>
        testServer.inject({
          method: "GET",
          url: `/api/v2/organizations/${subOrgId}/memberships`,
          headers: { authorization: `Bearer ${payload.token}` }
        });
    };

    beforeAll(async () => {
      const [subOrg] = await getDb()(TableName.Organization)
        .insert({
          name: "Session Binding Sub Org",
          slug: `binding-sub-${crypto.randomUUID().slice(0, 8)}`,
          rootOrgId: ORG_A_ID,
          parentOrgId: ORG_A_ID
        })
        .returning("*");
      subOrgId = subOrg.id;
    });

    afterEach(async () => {
      await getDb()(TableName.Organization).where({ id: ORG_A_ID }).update({ bypassOrgAuthEnabled: false });
    });

    afterAll(async () => {
      const db = getDb();
      await db(TableName.Membership).where({ scopeOrgId: subOrgId }).del();
      await db(TableName.Organization).where({ id: subOrgId }).del();
    });

    test("A sub-org session another org's IdP issued stops working once the root org starts enforcing SSO", async () => {
      const listSubOrgMemberships = await openSubOrgSession(OrgMembershipRole.Member);
      expect((await listSubOrgMemberships()).statusCode).toBe(200);

      await setAuthEnforced(ORG_A_ID, true);
      const refused = await listSubOrgMemberships();

      expect(refused.statusCode).toBe(403);
      expect(refused.json().message).toMatch(/another organization's identity provider/);
    });

    test("A sub-org admin role does not bypass the root org's enforcement", async () => {
      const listSubOrgMemberships = await openSubOrgSession(OrgMembershipRole.Admin);

      await getDb()(TableName.Organization).where({ id: ORG_A_ID }).update({ bypassOrgAuthEnabled: true });
      await setAuthEnforced(ORG_A_ID, true);
      const refused = await listSubOrgMemberships();

      expect(refused.statusCode).toBe(403);
      expect(refused.json().message).toMatch(/another organization's identity provider/);
    });

    test("Revoking the root org bypass refuses a sub-org project read on the next request", async () => {
      const { userId, tokens } = await loginThroughOrgBIdp();
      await addMemberToOrgA(userId);
      await addMemberToSubOrg(userId, OrgMembershipRole.Admin);
      const setRootOrgRole = (role: OrgMembershipRole) =>
        getDb()(TableName.MembershipRole)
          .whereIn(
            "membershipId",
            getDb()(TableName.Membership).where({ actorUserId: userId, scopeOrgId: ORG_A_ID }).select("id")
          )
          .update({ role });
      await setRootOrgRole(OrgMembershipRole.Admin);

      const { payload: selected } = await selectOrg(tokens.access, subOrgId);
      const authorization = `Bearer ${selected.token}`;
      const created = await testServer.inject({
        method: "POST",
        url: "/api/v1/projects",
        headers: { authorization },
        body: { projectName: `binding-sub-${crypto.randomUUID().slice(0, 8)}` }
      });
      expect(created.statusCode).toBe(200);
      const projectId = created.json().project.id as string;
      const readProject = () =>
        testServer.inject({ method: "GET", url: `/api/v1/projects/${projectId}`, headers: { authorization } });

      try {
        await getDb()(TableName.Organization).where({ id: ORG_A_ID }).update({ bypassOrgAuthEnabled: true });
        await setAuthEnforced(ORG_A_ID, true);
        expect((await readProject()).statusCode).toBe(200);

        // The project permission is cached and the sub-org project's fingerprint does not track root org roles.
        await setRootOrgRole(OrgMembershipRole.Member);
        const refused = await readProject();

        expect(refused.statusCode).toBe(403);
        expect(refused.json().message).toMatch(/another organization's identity provider/);
      } finally {
        await setAuthEnforced(ORG_A_ID, false);
        await testServer.inject({ method: "DELETE", url: `/api/v1/projects/${projectId}`, headers: { authorization } });
      }
    });
  });

  test("An enforced org's OAuth application refuses consent from a session another org's IdP issued", async () => {
    const created = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/clients",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: {
        name: `binding-consent-${crypto.randomUUID()}`,
        grantTypes: [OauthGrantType.AuthorizationCode],
        redirectUris: [REDIRECT_URI]
      }
    });
    expect(created.statusCode).toBe(200);
    const { client } = created.json<{ client: { id: string; clientId: string } }>();
    createdClientIds.push(client.id);

    const { userId, tokens } = await loginThroughOrgBIdp();
    await addMemberToOrgA(userId);
    await setAuthEnforced(ORG_A_ID, true);
    // Consent needs an org-scoped session; this one is scoped to the org whose IdP issued it.
    const { payload: selected } = await selectOrg(tokens.access, orgBId);

    const consented = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/authorize/consent",
      headers: { authorization: `Bearer ${selected.token}` },
      body: { client_id: client.clientId, redirect_uri: REDIRECT_URI }
    });

    expect(consented.statusCode).toBe(403);
    expect(consented.json().message).toMatch(/another organization's identity provider/);
  });

  test("Delegated OAuth tokens carry the issuing org", async () => {
    const created = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/clients",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: {
        name: `binding-delegated-${crypto.randomUUID()}`,
        grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
        redirectUris: [REDIRECT_URI]
      }
    });
    expect(created.statusCode).toBe(200);
    const { client, clientSecret } = created.json<{
      client: { id: string; clientId: string };
      clientSecret: string;
    }>();
    createdClientIds.push(client.id);

    const { userId, tokens } = await loginThroughOrgBIdp();
    await addMemberToOrgA(userId);
    const { payload: selected } = await selectOrg(tokens.access, ORG_A_ID);

    const consented = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/authorize/consent",
      headers: { authorization: `Bearer ${selected.token}` },
      body: { client_id: client.clientId, redirect_uri: REDIRECT_URI }
    });
    expect(consented.statusCode).toBe(200);
    const code = new URL(consented.json<{ callbackUrl: string }>().callbackUrl).searchParams.get("code");

    const issued = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: OauthGrantType.AuthorizationCode,
        code: code as string,
        redirect_uri: REDIRECT_URI,
        client_id: client.clientId,
        client_secret: clientSecret
      }).toString()
    });
    expect(issued.statusCode).toBe(200);
    const { access_token: accessToken, refresh_token: refreshToken } = issued.json<{
      access_token: string;
      refresh_token: string;
    }>();
    expect(decodeClaims(accessToken).issuingRootOrgId).toBe(orgBId);
    expect(decodeClaims(refreshToken).issuingRootOrgId).toBe(orgBId);
  });

  test("Another org that does not enforce SSO admits the session as today", async () => {
    const { userId, tokens } = await loginThroughOrgBIdp();
    await addMemberToOrgA(userId);

    const { statusCode, payload } = await selectOrg(tokens.access, ORG_A_ID);

    expect(statusCode).toBe(200);
    expect(decodeClaims(payload.token)).toMatchObject({ organizationId: ORG_A_ID, issuingRootOrgId: orgBId });
  });

  test("A password session is still refused at an enforced org as today", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);
    await setAuthEnforced(ORG_A_ID, true);

    const { statusCode, payload } = await selectOrg(accessToken, ORG_A_ID);

    expect(statusCode).toBe(403);
    expect(payload.message).toMatch(/Login with SAML SSO/);
  });

  test("Deleting an organization re-issues tokens that keep the issuing org", async () => {
    const { tokens } = await loginThroughOrgBIdp();

    const createRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/organizations",
      headers: { authorization: `Bearer ${tokens.access}` },
      body: { name: `binding-throwaway-${crypto.randomUUID().slice(0, 8)}` }
    });
    expect(createRes.statusCode).toBe(200);
    const throwawayOrgId = createRes.json().organization.id as string;

    const { payload: selected } = await selectOrg(tokens.access, throwawayOrgId);
    const deleteRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/organizations/${throwawayOrgId}`,
      headers: { authorization: `Bearer ${selected.token}`, "user-agent": "test-agent" }
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(decodeClaims(deleteRes.json().accessToken)).toMatchObject({
      authMethod: AuthMethod.OKTA_SAML,
      issuingRootOrgId: orgBId
    });
  });

  test("Token refresh carries the issuing org forward", async () => {
    const { tokens } = await loginThroughOrgBIdp();

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      cookies: { jid: tokens.refresh }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json() as { token: string; refreshToken?: string };
    expect(decodeClaims(payload.token).issuingRootOrgId).toBe(orgBId);
    expect(payload.refreshToken).toBeDefined();
    expect(decodeClaims(payload.refreshToken as string).issuingRootOrgId).toBe(orgBId);
  });
});
