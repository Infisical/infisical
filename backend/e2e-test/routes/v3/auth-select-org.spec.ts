import { decode } from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";

import { loginUser, selectOrg } from "../../testUtils/auth";

describe("Auth Select Organization V3", () => {
  test("Select org with valid token + org membership returns token", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { statusCode, payload } = await selectOrg(accessToken, seedData1.organization.id);

    expect(statusCode).toBe(200);
    expect(payload).toHaveProperty("token");
    expect(payload.isMfaEnabled).toBe(false);
  });

  test("Returned token is org-scoped", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { payload } = await selectOrg(accessToken, seedData1.organization.id);
    const decoded = decode(payload.token) as Record<string, unknown>;

    expect(decoded.organizationId).toBe(seedData1.organization.id);
  });

  test("Select org with non-member org ID returns 403", async () => {
    const { accessToken } = await loginUser(seedData1.email, seedData1.password);

    const { statusCode } = await selectOrg(accessToken, "00000000-0000-0000-0000-000000000099");

    expect(statusCode).toBe(403);
  });

  test("Select org without Authorization header returns 401", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/select-organization",
      body: { organizationId: seedData1.organization.id }
    });

    expect(res.statusCode).toBe(401);
  });
});
