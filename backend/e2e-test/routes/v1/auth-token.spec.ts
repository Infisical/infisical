import { seedData1 } from "@app/db/seed-data";

import { extractCookie } from "../../testUtils/cookies";

describe("Auth Token V1", () => {
  test("checkAuth with valid JWT returns 200", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/checkAuth",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      }
    });

    expect(res.statusCode).toBe(200);
  });

  test("checkAuth without JWT returns 401", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/checkAuth"
    });

    expect(res.statusCode).toBe(401);
  });

  test("Token refresh with valid jid cookie returns new token", async () => {
    // First login to get a refresh cookie
    const loginRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });
    expect(loginRes.statusCode).toBe(200);

    const refreshCookie = extractCookie(loginRes, "jid");
    expect(refreshCookie).toBeDefined();

    // Use the refresh cookie to get a new token
    const refreshRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      cookies: {
        jid: refreshCookie!
      }
    });

    expect(refreshRes.statusCode).toBe(200);
    const payload = refreshRes.json();
    expect(payload).toHaveProperty("token");
  });

  test("Token refresh without cookie returns error", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token"
    });

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  test("Logout invalidates session, subsequent refresh fails", async () => {
    // Login to get tokens
    const loginRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });
    expect(loginRes.statusCode).toBe(200);

    const { accessToken } = loginRes.json();
    const refreshCookie = extractCookie(loginRes, "jid");
    expect(refreshCookie).toBeDefined();

    // Logout
    const logoutRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      cookies: {
        jid: refreshCookie!
      }
    });
    expect(logoutRes.statusCode).toBe(200);

    // Subsequent refresh should fail
    const refreshRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      cookies: {
        jid: refreshCookie!
      }
    });

    expect(refreshRes.statusCode).toBeGreaterThanOrEqual(400);
  });

  // cloudflared forwards the frontend's bodyless refresh POST this way
  test("Token refresh with an empty chunked body and no Content-Type returns new token", async () => {
    const loginRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });
    expect(loginRes.statusCode).toBe(200);

    const refreshCookie = extractCookie(loginRes, "jid");
    expect(refreshCookie).toBeDefined();

    const refreshRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      headers: {
        "transfer-encoding": "chunked"
      },
      cookies: {
        jid: refreshCookie!
      }
    });

    expect(refreshRes.statusCode).toBe(200);
    expect(refreshRes.json()).toHaveProperty("token");
  });

  test("Chunked body with content but no Content-Type returns 415", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      headers: {
        "transfer-encoding": "chunked"
      },
      payload: "unexpected"
    });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ statusCode: 415, error: "FST_ERR_CTP_INVALID_MEDIA_TYPE" });
  });

  test("Unsupported Content-Type returns 415", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      headers: {
        "content-type": "text/xml"
      },
      payload: "<token/>"
    });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ statusCode: 415, error: "FST_ERR_CTP_INVALID_MEDIA_TYPE" });
  });

  // Over the 1 MiB body limit, so a parser that buffered before rejecting would answer 413
  test.each([
    { name: "unsupported Content-Type", headers: { "content-type": "text/xml" } },
    { name: "no Content-Type", headers: { "transfer-encoding": "chunked" } }
  ])("Oversized body with $name is rejected with 415 without being read", async ({ headers }) => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      headers,
      payload: Buffer.alloc(2 * 1024 * 1024, "a")
    });

    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ statusCode: 415, error: "FST_ERR_CTP_INVALID_MEDIA_TYPE" });
    // The unread rest of the body must not be parsed as the next request on this socket
    expect(res.headers.connection).toBe("close");
  });

  test("Malformed JSON body returns 400", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/token",
      headers: {
        "content-type": "application/json"
      },
      payload: "{bad"
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ statusCode: 400, error: "FST_ERR_CTP_INVALID_JSON_BODY" });
  });
});
