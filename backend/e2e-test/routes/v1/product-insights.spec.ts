import { describe, expect, test } from "vitest";

const URL = "/api/v1/product-insights/secrets/usage-insights";

// The counting itself is covered against a real database in e2e-test/product-insights-service.spec.ts.
// This file only asserts the route wiring, because the e2e instance runs unlicensed and the plan gate
// therefore rejects every request before any count is taken.
describe("Product Insights V1 Router", async () => {
  test("GET usage insights requires authentication", async () => {
    const res = await testServer.inject({ method: "GET", url: URL });
    expect(res.statusCode).toBe(401);
  });

  test("GET usage insights is registered and refuses on plan restriction", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: URL,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    // 400, not 403: the seeded user is an org admin, so it clears the Secrets Management Insights
    // permission check and falls through to the licence gate.
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Upgrade your plan");
  });
});
