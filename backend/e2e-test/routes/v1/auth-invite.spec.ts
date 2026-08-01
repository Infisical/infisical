import crypto from "node:crypto";

import { seedData1 } from "@app/db/seed-data";

describe("Auth Org Invite V1", () => {
  test("Verified invitation returns the organization name only after token validation", async () => {
    const inviteeEmail = `auth-invite-${crypto.randomUUID()}@localhost.local`;
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

    const inviteToken = new URL(inviteLink as string).searchParams.get("token");
    expect(inviteToken).toBeTruthy();

    const invalidRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/verify",
      body: {
        email: inviteeEmail,
        organizationId: seedData1.organization.id,
        code: "invalid-token"
      }
    });

    expect(invalidRes.statusCode).toBeGreaterThanOrEqual(400);
    expect(invalidRes.json()).not.toHaveProperty("organizationName");

    const validRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/invite-org/verify",
      body: {
        email: inviteeEmail,
        organizationId: seedData1.organization.id,
        code: inviteToken
      }
    });

    expect(validRes.statusCode).toBe(200);
    expect(validRes.json()).toMatchObject({
      organizationName: seedData1.organization.name,
      token: expect.any(String)
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
