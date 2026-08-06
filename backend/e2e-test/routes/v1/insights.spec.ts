import { describe, expect, test } from "vitest";

const URL = "/api/v1/insights/secrets/usage-insights";

// The counting itself is covered against a real database in e2e-test/insights-usage.spec.ts.
// This file only asserts the route wiring, because the e2e instance runs unlicensed and the plan gate
// therefore rejects every request before any count is taken.
describe("Insights V1 Router (org-scoped)", async () => {
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

  const WARNINGS_URL = "/api/v1/insights/secrets/project-warnings";

  test("GET project warnings is registered and refuses on plan restriction", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: WARNINGS_URL,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Upgrade your plan");
  });

  test("GET project warnings rejects an out-of-bounds limit", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `${WARNINGS_URL}?limit=500`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    // Schema validation failures map to 422 (ValidationError in error-handler.ts)
    expect(res.statusCode).toBe(422);
  });
});
