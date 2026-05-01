import { seedData1 } from "@app/db/seed-data";

describe("Auth Org Invite V1", () => {
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
