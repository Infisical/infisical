import { describe, expect, test } from "vitest";

// The database-backed org insights, their validation and search by value are covered in
// tests/suites/secretmanager/insights. These read audit logs from ClickHouse, which neither the e2e
// instance nor the Go suite runs, and the Go client has no operation for them.
const CLICKHOUSE_BACKED_URLS = {
  accessVolume: "/api/v1/insights/secrets/access-volume",
  authMethods: "/api/v1/insights/secrets/usage/auth-methods"
};

describe("Insights V1 Router (org-scoped)", async () => {
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

  test.each(Object.entries(CLICKHOUSE_BACKED_URLS))("GET %s requires authentication", async (_, url) => {
    const res = await testServer.inject({ method: "GET", url });

    expect(res.statusCode).toBe(401);
  });
});
