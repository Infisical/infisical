import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig, initEnvConfig } from "@app/lib/config/env";
import { initLogger, logger } from "@app/lib/logger";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { OauthGrantType } from "@app/services/oauth-client/oauth-client-types";

declare const testKeyStore: TKeyStoreFactory;

// SCIM and admin deactivation flip only the root membership row; sub-org memberships are separate rows
// that stay active. These pin that a root-org deactivation still cuts off tokens scoped below it, for
// access tokens, the refresh endpoint (including its grace window) and the OAuth refresh grant.
const ROOT_ORG_ID = seedData1.organization.id;
const REDIRECT_URI = "https://app.example.com/callback";

type TScope = { organizationId?: string; subOrganizationId?: string };
type TMember = {
  userId: string;
  subOrgId: string;
  rootMembershipId: string;
  subMembershipId: string;
  sessionId: string;
};

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];
const createdClientIds: string[] = [];

const addOrgMembership = async (userId: string, orgId: string) => {
  const [membership] = await testDb(TableName.Membership)
    .insert({
      scope: AccessScope.Organization,
      scopeOrgId: orgId,
      actorUserId: userId,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    })
    .returning("*");
  await testDb(TableName.MembershipRole).insert({ membershipId: membership.id, role: OrgMembershipRole.Member });
  return membership.id;
};

const makeOrg = async (rootOrgId?: string) => {
  const [org] = await testDb(TableName.Organization)
    .insert({
      name: `scope-${crypto.randomUUID()}`,
      slug: `scope-${crypto.randomUUID()}`,
      rootOrgId: rootOrgId ?? null,
      parentOrgId: rootOrgId ?? null
    })
    .returning("*");
  createdOrgIds.push(org.id);
  return org.id;
};

// A member of the seed root org and of a fresh sub-org under it, with one session.
const makeMember = async (): Promise<TMember> => {
  const email = `scope-${crypto.randomUUID()}@auth-scope.example`;
  const [user] = await testDb(TableName.Users)
    .insert({ username: email, email, isAccepted: true, isGhost: false, authMethods: [AuthMethod.EMAIL] })
    .returning("*");
  createdUserIds.push(user.id);

  const subOrgId = await makeOrg(ROOT_ORG_ID);
  const rootMembershipId = await addOrgMembership(user.id, ROOT_ORG_ID);
  const subMembershipId = await addOrgMembership(user.id, subOrgId);

  const [session] = await testDb(TableName.AuthTokenSession)
    .insert({
      userId: user.id,
      ip: "127.0.0.1",
      userAgent: "e2e-auth-token-org-scope",
      accessVersion: 1,
      refreshVersion: 1,
      lastUsed: new Date()
    } as never)
    .returning("*");

  return { userId: user.id, subOrgId, rootMembershipId, subMembershipId, sessionId: session.id };
};

const accessToken = (member: TMember, scope: TScope) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      authMethod: AuthMethod.EMAIL,
      userId: member.userId,
      tokenVersionId: member.sessionId,
      accessVersion: 1,
      ...scope
    },
    getConfig().AUTH_SECRET,
    { expiresIn: 3600 }
  );

const refreshToken = (member: TMember, scope: TScope) =>
  jwt.sign(
    {
      authTokenType: AuthTokenType.REFRESH_TOKEN,
      authMethod: AuthMethod.EMAIL,
      userId: member.userId,
      tokenVersionId: member.sessionId,
      refreshVersion: 1,
      ...scope
    },
    getConfig().AUTH_SECRET,
    { expiresIn: 3600 }
  );

const subScope = (member: TMember): TScope => ({ organizationId: ROOT_ORG_ID, subOrganizationId: member.subOrgId });

const readOrgMembers = (token: string, orgId: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v2/organizations/${orgId}/memberships`,
    headers: { authorization: `Bearer ${token}` }
  });

const refresh = (jid: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/auth/token",
    cookies: { jid }
  });

const setMembershipActive = (membershipId: string, isActive: boolean) =>
  testDb(TableName.Membership).where({ id: membershipId }).update({ isActive });

const refreshVersionOf = async (sessionId: string) =>
  (await testDb(TableName.AuthTokenSession).where({ id: sessionId }).first())?.refreshVersion;

const clearsJidCookie = (res: Awaited<ReturnType<typeof refresh>>) => {
  const cookies = res.headers["set-cookie"];
  const list = Array.isArray(cookies) ? cookies : [cookies ?? ""];
  return list.some((c) => c.startsWith("jid=;") && /Max-Age=0/i.test(c));
};

const postOauthToken = (body: Record<string, string>) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/oauth/token",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams(body).toString()
  });

describe("Org scope of user tokens after root membership deactivation", () => {
  beforeAll(async () => {
    initLogger();
    await initEnvConfig(testHsmService, testKmsRootConfigDAL, testSuperAdminDAL, logger);
  });

  afterEach(async () => {
    await Promise.all(
      createdClientIds.splice(0).map((id) =>
        testServer.inject({
          method: "DELETE",
          url: `/api/v1/oauth/clients/${id}`,
          headers: { authorization: `Bearer ${jwtAuthToken}` }
        })
      )
    );
    if (createdUserIds.length) {
      const membershipIds = await testDb(TableName.Membership)
        .whereIn("actorUserId", createdUserIds)
        .select("id")
        .then((rows) => rows.map((r) => r.id));
      if (membershipIds.length) await testDb(TableName.MembershipRole).whereIn("membershipId", membershipIds).del();
      await testDb(TableName.Membership).whereIn("actorUserId", createdUserIds).del();
      await testDb(TableName.AuthTokenSession).whereIn("userId", createdUserIds).del();
      await testDb(TableName.Users).whereIn("id", createdUserIds).del();
      createdUserIds.length = 0;
    }
    if (createdOrgIds.length) {
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).whereNotNull("rootOrgId").del();
      await testDb(TableName.Organization).whereIn("id", createdOrgIds).del();
      createdOrgIds.length = 0;
    }
  });

  test("baseline: an active member's sub-org token works and refreshes with its scope intact", async () => {
    const member = await makeMember();

    expect((await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId)).statusCode).toBe(200);

    const res = await refresh(refreshToken(member, subScope(member)));
    expect(res.statusCode).toBe(200);
    const { token } = res.json<{ token: string }>();
    expect(jwt.decode(token)).toMatchObject({ organizationId: ROOT_ORG_ID, subOrganizationId: member.subOrgId });
  });

  test("a sub-org token is refused on any request once the root membership is inactive", async () => {
    const member = await makeMember();
    await setMembershipActive(member.rootMembershipId, false);

    const subRes = await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId);
    expect(subRes.statusCode).toBe(403);
    expect(subRes.payload).toContain("inactive");

    const rootRes = await readOrgMembers(accessToken(member, { organizationId: ROOT_ORG_ID }), ROOT_ORG_ID);
    expect(rootRes.statusCode).toBe(403);

    const subRow = await testDb(TableName.Membership).where({ id: member.subMembershipId }).first();
    expect(subRow?.isActive).toBe(true);
  });

  test("a sub-org token is refused when only the sub-org membership is inactive", async () => {
    const member = await makeMember();
    await setMembershipActive(member.subMembershipId, false);

    expect((await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId)).statusCode).toBe(403);
    expect((await readOrgMembers(accessToken(member, { organizationId: ROOT_ORG_ID }), ROOT_ORG_ID)).statusCode).toBe(
      200
    );
  });

  test("a deprovisioned root member's refresh is refused, clears the cookie and does not rotate", async () => {
    const member = await makeMember();
    await setMembershipActive(member.rootMembershipId, false);

    const expectRefused = (res: Awaited<ReturnType<typeof refresh>>) => {
      expect(res.statusCode).toBe(403);
      expect(res.json()).not.toHaveProperty("token");
      expect(clearsJidCookie(res)).toBe(true);
    };
    expectRefused(await refresh(refreshToken(member, subScope(member))));
    expectRefused(await refresh(refreshToken(member, { organizationId: ROOT_ORG_ID })));
    expect(await refreshVersionOf(member.sessionId)).toBe(1);
    expect(await testKeyStore.getItem(KeyStorePrefixes.RefreshTokenGrace(member.sessionId))).toBeNull();
  });

  test("a grace-window refresh by a deprovisioned member is refused", async () => {
    const member = await makeMember();
    const original = refreshToken(member, subScope(member));

    expect((await refresh(original)).statusCode).toBe(200);
    await setMembershipActive(member.rootMembershipId, false);

    // The rotation parked the old refreshVersion as a grace entry, so replaying the original token now
    // takes the grace-hit branch rather than reuse detection.
    expect(await testKeyStore.getItem(KeyStorePrefixes.RefreshTokenGrace(member.sessionId))).toBe("1");

    const res = await refresh(original);
    expect(res.statusCode).toBe(403);
    expect(res.json()).not.toHaveProperty("token");
  });

  test("reactivating the root membership restores access and the unrotated refresh token", async () => {
    const member = await makeMember();
    await setMembershipActive(member.rootMembershipId, false);
    expect((await refresh(refreshToken(member, subScope(member)))).statusCode).toBe(403);

    await setMembershipActive(member.rootMembershipId, true);
    expect((await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId)).statusCode).toBe(200);
    expect((await refresh(refreshToken(member, subScope(member)))).statusCode).toBe(200);
  });

  test.each([
    ["permanently locked", { isLocked: true }],
    ["temporarily locked", { temporaryLockDateEnd: new Date(Date.now() + 10 * 60 * 1000) }],
    ["not accepted", { isAccepted: false }]
  ])("a %s user's refresh is refused without rotating", async (_label, patch) => {
    const member = await makeMember();
    await testDb(TableName.Users).where({ id: member.userId }).update(patch);

    const res = await refresh(refreshToken(member, subScope(member)));
    expect(res.statusCode).toBe(401);
    expect(clearsJidCookie(res)).toBe(true);
    expect(await refreshVersionOf(member.sessionId)).toBe(1);
  });

  test("tokens scoped to a deleted org are refused with 401, not a 500", async () => {
    const member = await makeMember();
    const doomedOrgId = await makeOrg();
    await addOrgMembership(member.userId, doomedOrgId);
    await testDb(TableName.Membership).where({ scopeOrgId: doomedOrgId }).del();
    await testDb(TableName.Organization).where({ id: doomedOrgId }).del();

    const accessRes = await testServer.inject({
      method: "GET",
      url: "/api/v1/user",
      headers: { authorization: `Bearer ${accessToken(member, { organizationId: doomedOrgId })}` }
    });
    expect(accessRes.statusCode).toBe(401);

    const refreshRes = await refresh(refreshToken(member, { organizationId: doomedOrgId }));
    expect(refreshRes.statusCode).toBe(401);
    expect(refreshRes.payload).toContain("no longer exists");
  });

  // SCIM provisions the root membership as Invited, and selecting a sub-org never promotes it.
  test("a still-Invited but active root member can use and refresh a sub-org token", async () => {
    const member = await makeMember();
    await testDb(TableName.Membership)
      .where({ id: member.rootMembershipId })
      .update({ status: OrgMembershipStatus.Invited });

    expect((await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId)).statusCode).toBe(200);
    expect((await refresh(refreshToken(member, subScope(member)))).statusCode).toBe(200);

    await setMembershipActive(member.rootMembershipId, false);
    expect((await readOrgMembers(accessToken(member, subScope(member)), member.subOrgId)).statusCode).toBe(403);
  });

  test("tokens scoped to a deleted sub-org are refused with 401, not a 400", async () => {
    const member = await makeMember();
    await testDb(TableName.MembershipRole).where({ membershipId: member.subMembershipId }).del();
    await testDb(TableName.Membership).where({ id: member.subMembershipId }).del();
    await testDb(TableName.Organization).where({ id: member.subOrgId }).del();

    const accessRes = await testServer.inject({
      method: "GET",
      url: "/api/v1/user",
      headers: { authorization: `Bearer ${accessToken(member, subScope(member))}` }
    });
    expect(accessRes.statusCode).toBe(401);

    const refreshRes = await refresh(refreshToken(member, subScope(member)));
    expect(refreshRes.statusCode).toBe(401);
    expect(refreshRes.payload).toContain("no longer exists");
  });

  test("claim shapes no issuer produces are refused", async () => {
    const member = await makeMember();

    const noRoot = await testServer.inject({
      method: "GET",
      url: "/api/v1/user",
      headers: { authorization: `Bearer ${accessToken(member, { subOrganizationId: member.subOrgId })}` }
    });
    expect(noRoot.statusCode).toBe(401);

    const subIsRoot = await readOrgMembers(
      accessToken(member, { organizationId: ROOT_ORG_ID, subOrganizationId: ROOT_ORG_ID }),
      ROOT_ORG_ID
    );
    expect(subIsRoot.statusCode).toBe(403);
    expect(subIsRoot.payload).toContain("does not belong");
  });

  test("the OAuth refresh grant is refused as invalid_grant once the root membership is inactive", async () => {
    const member = await makeMember();

    const created = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/clients",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: {
        name: `e2e-org-scope-${crypto.randomUUID()}`,
        grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
        redirectUris: [REDIRECT_URI]
      }
    });
    expect(created.statusCode).toBe(200);
    const { client, clientSecret } = created.json<{ client: { id: string; clientId: string }; clientSecret: string }>();
    createdClientIds.push(client.id);

    const consented = await testServer.inject({
      method: "POST",
      url: "/api/v1/oauth/authorize/consent",
      headers: { authorization: `Bearer ${accessToken(member, { organizationId: ROOT_ORG_ID })}` },
      body: { client_id: client.clientId, redirect_uri: REDIRECT_URI }
    });
    expect(consented.statusCode).toBe(200);
    const { callbackUrl } = consented.json<{ callbackUrl: string }>();

    const issued = await postOauthToken({
      grant_type: OauthGrantType.AuthorizationCode,
      code: new URL(callbackUrl).searchParams.get("code") as string,
      redirect_uri: REDIRECT_URI,
      client_id: client.clientId,
      client_secret: clientSecret
    });
    expect(issued.statusCode).toBe(200);
    const firstRefresh = issued.json<{ refresh_token: string }>().refresh_token;

    const refreshBody = (token: string) => ({
      grant_type: OauthGrantType.RefreshToken,
      refresh_token: token,
      client_id: client.clientId,
      client_secret: clientSecret
    });

    const active = await postOauthToken(refreshBody(firstRefresh));
    expect(active.statusCode).toBe(200);
    const secondRefresh = active.json<{ refresh_token: string }>().refresh_token;

    await setMembershipActive(member.rootMembershipId, false);

    const refused = await postOauthToken(refreshBody(secondRefresh));
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: "invalid_grant" });
  });
});
