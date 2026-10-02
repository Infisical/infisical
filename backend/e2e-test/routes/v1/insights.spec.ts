import { describe, expect, test } from "vitest";

const PROJECTS_URL = "/api/v1/insights/secrets/projects";

// Every org-scoped insight, by the URL the router registers it at. The aggregation behind each one is
// covered against a real database (or a faked ClickHouse) in the e2e-test/insights-*.spec.ts files,
// including the plan gate. This file only asserts the wiring. The e2e license mock includes insights,
// so the seeded admin clears both the permission and the plan check.
const DATABASE_BACKED_URLS = {
  summary: "/api/v1/insights/secrets/summary",
  projects: PROJECTS_URL,
  staticSecrets: "/api/v1/insights/secrets/usage/static-secrets"
};

// These read audit logs from ClickHouse, which the e2e instance does not run.
const CLICKHOUSE_BACKED_URLS = {
  accessVolume: "/api/v1/insights/secrets/access-volume",
  authMethods: "/api/v1/insights/secrets/usage/auth-methods"
};

const ORG_SCOPED_URLS = { ...DATABASE_BACKED_URLS, ...CLICKHOUSE_BACKED_URLS };

describe("Insights V1 Router (org-scoped)", async () => {
  test.each(Object.entries(DATABASE_BACKED_URLS))("GET %s is registered and answers", async (_, url) => {
    const res = await testServer.inject({
      method: "GET",
      url,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });

    expect(res.statusCode).toBe(200);
  });

  test.each(Object.entries(CLICKHOUSE_BACKED_URLS))(
    "GET %s is registered and says ClickHouse is required",
    async (_, url) => {
      const res = await testServer.inject({
        method: "GET",
        url,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain("ClickHouse");
    }
  );

  test.each(Object.entries(ORG_SCOPED_URLS))("GET %s requires authentication", async (_, url) => {
    const res = await testServer.inject({ method: "GET", url });

    expect(res.statusCode).toBe(401);
  });

  // What value search finds is covered in routes/v3/secrets-management.spec.ts.
  test("POST secrets search-by-value rejects an empty value", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/insights/secrets/search-by-value",
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: { secretValue: "" }
    });

    expect(res.statusCode).toBe(422);
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
