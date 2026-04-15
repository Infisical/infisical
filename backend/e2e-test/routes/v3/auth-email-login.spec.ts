import { decode } from "jsonwebtoken";

import { seedData1 } from "@app/db/seed-data";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";

import { extractCookie } from "../../testUtils/cookies";

describe("Auth Email Login V3", () => {
  test("Login with valid email + password returns accessToken and sets jid cookie", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });

    expect(res.statusCode).toBe(200);
    const payload = res.json();
    expect(payload).toHaveProperty("accessToken");
    expect(typeof payload.accessToken).toBe("string");

    const refreshCookie = extractCookie(res, "jid");
    expect(refreshCookie).toBeDefined();
  });

  test("Login with wrong password returns 400", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: "wrongPassword123!"
      }
    });

    expect(res.statusCode).toBe(400);
  });

  test("Login with non-existent email returns 400", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: "nonexistent@localhost.local",
        password: seedData1.password
      }
    });

    expect(res.statusCode).toBe(400);
  });

  test("Returned token has correct JWT claims", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login",
      body: {
        email: seedData1.email,
        password: seedData1.password
      }
    });

    expect(res.statusCode).toBe(200);
    const { accessToken } = res.json();

    const decoded = decode(accessToken) as Record<string, unknown>;
    expect(decoded.userId).toBe(seedData1.id);
    expect(decoded.authMethod).toBe(AuthMethod.EMAIL);
    expect(decoded.authTokenType).toBe(AuthTokenType.ACCESS_TOKEN);
  });
});
