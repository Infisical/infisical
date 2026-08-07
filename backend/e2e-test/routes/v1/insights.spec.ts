import { describe, expect, test } from "vitest";

const PROJECTS_URL = "/api/v1/insights/secrets/projects";

// Every org-scoped insight, by the URL the router registers it at. The aggregation behind each one is
// covered against a real database (or a faked ClickHouse) in the e2e-test/insights-*.spec.ts files.
// This file only asserts the wiring, because the e2e instance runs unlicensed and the plan gate
// therefore rejects every request before any aggregate is computed.
const ORG_SCOPED_URLS = {
  summary: "/api/v1/insights/secrets/summary",
  projects: PROJECTS_URL,
  accessVolume: "/api/v1/insights/secrets/access-volume",
  authMethods: "/api/v1/insights/secrets/usage/auth-methods",
  staticSecrets: "/api/v1/insights/secrets/usage/static-secrets",
  counts: "/api/v1/insights/secrets/counts"
};

describe("Insights V1 Router (org-scoped)", async () => {
  test.each(Object.entries(ORG_SCOPED_URLS))("GET %s is registered and refuses on plan restriction", async (_, url) => {
    const res = await testServer.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    // 400, not 403: the seeded user is an org admin, so it clears the Secrets Management Insights
    // permission check and falls through to the licence gate.
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain("Upgrade your plan");
  });

  test.each(Object.entries(ORG_SCOPED_URLS))("GET %s requires authentication", async (_, url) => {
    const res = await testServer.inject({ method: "GET", url });

    expect(res.statusCode).toBe(401);
  });

  test("GET secrets projects rejects an out-of-bounds limit", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `${PROJECTS_URL}?limit=500`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    // Schema validation failures map to 422 (ValidationError in error-handler.ts)
    expect(res.statusCode).toBe(422);
  });

  test("GET secrets projects rejects a negative offset", async () => {
    const res = await testServer.inject({
      method: "GET",
      url: `${PROJECTS_URL}?offset=-1`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    expect(res.statusCode).toBe(422);
  });
});
