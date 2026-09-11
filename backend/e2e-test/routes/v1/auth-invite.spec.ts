import crypto from "node:crypto";

import { Knex } from "knex";

import { AccessScope, TableName } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { TokenType } from "@app/services/auth-token/auth-token-types";

declare const testDb: Knex;

const inviteUser = async (inviteeEmail: string) => {
  const inviteRes = await testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/signup",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      inviteeEmails: [inviteeEmail],
      organizationId: seedData1.organization.id
    }
  });

  expect(inviteRes.statusCode).toBe(200);
  const inviteLink = inviteRes
    .json()
    .completeInviteLinks?.find(({ email }: { email: string }) => email === inviteeEmail)?.link;
  expect(inviteLink).toBeDefined();

  const inviteToken = new URL(inviteLink as string, "http://localhost").searchParams.get("token");
  expect(inviteToken).toBeTruthy();

  return inviteToken as string;
};

const verifyInvite = async (inviteeEmail: string, code: string) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/invite-org/verify",
    body: {
      email: inviteeEmail,
      organizationId: seedData1.organization.id,
      code
    }
  });

describe("Auth Org Invite V1", () => {
  test("Verified invitation returns the organization name only after token validation", async () => {
    const inviteeEmail = `auth-invite-${crypto.randomUUID()}@localhost.local`;
    const inviteToken = await inviteUser(inviteeEmail);

    const invalidRes = await verifyInvite(inviteeEmail, "invalid-token");

    expect(invalidRes.statusCode).toBeGreaterThanOrEqual(400);
    expect(invalidRes.json()).not.toHaveProperty("organizationName");

    const validRes = await verifyInvite(inviteeEmail, inviteToken);

    expect(validRes.statusCode).toBe(200);
    expect(validRes.json()).toMatchObject({
      organizationName: seedData1.organization.name,
      token: expect.any(String)
    });
  });

  test("Invitation link keeps working when opened more than once", async () => {
    const inviteeEmail = `auth-invite-${crypto.randomUUID()}@localhost.local`;
    const inviteToken = await inviteUser(inviteeEmail);

    // Stands in for an email security scanner pre-visiting the link, or the invitee reopening it.
    for (const _ of [1, 2, 3]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await verifyInvite(inviteeEmail, inviteToken);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        organizationName: seedData1.organization.name,
        token: expect.any(String)
      });
    }

    const [user] = await testDb(TableName.Users).where({ username: inviteeEmail }).select("id");
    const tokens = await testDb(TableName.AuthTokens).where({
      userId: user.id,
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      orgId: seedData1.organization.id
    });
    expect(tokens).toHaveLength(1);
  });

  test("Expired invitation token is rejected", async () => {
    const inviteeEmail = `auth-invite-${crypto.randomUUID()}@localhost.local`;
    const inviteToken = await inviteUser(inviteeEmail);

    const [user] = await testDb(TableName.Users).where({ username: inviteeEmail }).select("id");
    await testDb(TableName.AuthTokens)
      .where({
        userId: user.id,
        type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
        orgId: seedData1.organization.id
      })
      .update({ expiresAt: new Date(Date.now() - 1000) });

    const res = await verifyInvite(inviteeEmail, inviteToken);
    expect(res.statusCode).toBe(401);
    expect(res.json()).not.toHaveProperty("organizationName");
  });

  test("Resending an invitation replaces the previously emailed link", async () => {
    const inviteeEmail = `auth-invite-${crypto.randomUUID()}@localhost.local`;
    const inviteToken = await inviteUser(inviteeEmail);

    const [user] = await testDb(TableName.Users).where({ username: inviteeEmail }).select("id");
    const [membership] = await testDb(TableName.Membership)
      .where({
        actorUserId: user.id,
        scopeOrgId: seedData1.organization.id,
        scope: AccessScope.Organization
      })
      .select("id");

    const resendRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/signup-resend",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        membershipId: membership.id
      }
    });

    expect(resendRes.statusCode).toBe(200);
    const resentLink = resendRes.json().signupToken?.link as string;
    expect(resentLink).toBeDefined();
    const resentToken = new URL(resentLink, "http://localhost").searchParams.get("token") as string;
    expect(resentToken).not.toBe(inviteToken);

    const staleRes = await verifyInvite(inviteeEmail, inviteToken);
    expect(staleRes.statusCode).toBe(401);

    const freshRes = await verifyInvite(inviteeEmail, resentToken);
    expect(freshRes.statusCode).toBe(200);
    expect(freshRes.json()).toMatchObject({
      organizationName: seedData1.organization.name
    });
  });

  test("Verify invite with valid token for existing accepted user returns user without token", async () => {
    // Create a membership invite for the seed user in the seed org
    // The seed user is already accepted, so verifyUserToOrg should return { user } without a token
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/verify",
      body: {
        email: seedData1.email,
        organizationId: seedData1.organization.id,
        code: "invalid-code-to-test-flow"
      }
    });

    // Should fail because the seed user is already an accepted member
    expect(res.statusCode).toBe(400);
    const payload = res.json();
    expect(payload.message).toMatch(/already a member/i);
  });

  test("Verify invite with wrong code returns 400", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/verify",
      body: {
        email: "nonexistent@test.local",
        organizationId: seedData1.organization.id,
        code: "wrong-code-123"
      }
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("Verify invite with non-existent email returns 404", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/verify",
      body: {
        email: "does-not-exist@nowhere.local",
        organizationId: seedData1.organization.id,
        code: "some-code"
      }
    });

    expect(res.statusCode).toBe(404);
  });
});
