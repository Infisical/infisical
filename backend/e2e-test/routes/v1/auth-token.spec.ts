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

  test("checkAuth with a JWT whose session was revoked returns 401", async () => {
    // A distinct user agent gets a session of its own, so revoking it leaves the shared test session alone.
    const loginRes = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      headers: { "user-agent": "auth-token-spec-revoked-session" },
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });
    expect(loginRes.statusCode).toBe(200);

    const { accessToken } = loginRes.json();
    const { tokenVersionId } = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString()) as {
      tokenVersionId: string;
    };
    expect(tokenVersionId).not.toBe(seedData1.token.id);

    const revokeRes = await testServer.inject({
      method: "DELETE",
      url: `/api/v2/users/me/sessions/${tokenVersionId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
    expect(revokeRes.statusCode).toBe(200);

    const res = await testServer.inject({
      method: "POST",
      url: "/api/v1/auth/checkAuth",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      reqId: expect.any(String),
      statusCode: 401,
      error: "InvalidToken",
      message: "Your session is no longer valid, please re-authenticate"
    });
  });
});
