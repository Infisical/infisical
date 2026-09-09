// The unknown-route 404 is a public contract: clients that guess at URLs (typically headless
// agents) rely on the body to find the OpenAPI spec and self-correct. Pin the shape here so the
// pointer cannot silently disappear.

const DOCS_PATH = "/api/docs/json";

describe("Unknown route 404", () => {
  test("returns the standard body with a pointer to the OpenAPI spec", async () => {
    const res = await testServer.inject({ method: "GET", url: "/api/v1/this-route-does-not-exist" });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as Record<string, unknown>;
    expect(body).toMatchObject({
      statusCode: 404,
      error: "Not Found",
      docs: DOCS_PATH
    });
    expect(typeof body.reqId).toBe("string");
    expect((body.reqId as string).length).toBeGreaterThan(0);
    expect(body.message).toMatch(/^Route GET:\/api\/v1\/this-route-does-not-exist not found\./);
    expect(body.message).toContain(DOCS_PATH);
  });

  test("names the method and strips the query string from the reported route", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/nope?workspaceId=abc&environment=dev",
      headers: { "content-type": "application/json" },
      payload: {}
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as { message: string };
    expect(body.message).toMatch(/^Route POST:\/api\/v3\/nope not found\./);
    expect(body.message).not.toContain("workspaceId");
  });

  test("the advertised docs path actually resolves to the OpenAPI document", async () => {
    const res = await testServer.inject({ method: "GET", url: DOCS_PATH });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/json");
    const spec = JSON.parse(res.payload) as { openapi?: string; paths?: Record<string, unknown> };
    expect(spec.openapi).toBeDefined();
    expect(Object.keys(spec.paths ?? {}).length).toBeGreaterThan(0);
  });

  test("known routes are unaffected", async () => {
    const res = await testServer.inject({ method: "GET", url: "/api/status" });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toHaveProperty("message", "Ok");
  });
});
