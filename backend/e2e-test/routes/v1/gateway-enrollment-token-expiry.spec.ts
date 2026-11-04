// An enrollment token lives for an hour and nothing moves the clock, so the test moves the deadline:
// the stored token is backdated, which is exactly the state an hour of waiting would leave.
import crypto from "node:crypto";

import { TableName } from "@app/db/schemas";

import { createIsolatedOrgAndProject } from "e2e-test/testUtils/fixtures";

describe("Gateway enrollment token expiry", () => {
  let authToken: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ authToken, cleanup } = await createIsolatedOrgAndProject("gateway-enrollment-expiry"));
  });

  afterAll(async () => {
    await cleanup();
  });

  test("an expired enrollment token is refused and cannot be used again", async () => {
    const headers = { authorization: `Bearer ${authToken}` };
    const created = await testServer.inject({
      method: "POST",
      url: "/api/v3/gateways",
      headers,
      body: { name: `gw-${crypto.randomUUID().slice(0, 8)}`, authMethod: { method: "token" } }
    });
    expect(created.statusCode, created.payload).toBe(200);
    const gatewayId = (created.json().gateway?.id ?? created.json().id) as string;

    const minted = await testServer.inject({
      method: "POST",
      url: `/api/v3/gateways/${gatewayId}/token-auth/generate-enrollment-token`,
      headers
    });
    expect(minted.statusCode, minted.payload).toBe(200);
    const { token } = minted.json() as { token: string };
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await testDb(TableName.ResourceTokenAuth)
      .where({ tokenHash })
      .update({ expiresAt: new Date(Date.now() - 60_000) });

    const login = await testServer.inject({
      method: "POST",
      url: "/api/v3/gateways/login",
      body: { method: "token", token }
    });
    expect(login.statusCode).toBe(400);
    expect(login.json().message).toBe("Enrollment token has expired");

    const again = await testServer.inject({
      method: "POST",
      url: "/api/v3/gateways/login",
      body: { method: "token", token }
    });
    expect(again.statusCode).toBe(400);
    expect(again.json().message).toBe("Invalid enrollment token");
  });
});
