import type { FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import { crypto } from "@app/lib/crypto";
import { AuthMethod, AuthMode, AuthTokenType } from "@app/services/auth/auth-type";

import { extractAuth } from "./inject-identity";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const AUTH_SECRET = "test-secret-for-extract-auth-unit-tests";

const baseAccessClaims = {
  authTokenType: AuthTokenType.ACCESS_TOKEN as const,
  authMethod: AuthMethod.EMAIL,
  userId: "user-1",
  tokenVersionId: "session-1",
  accessVersion: 1,
  organizationId: "org-1"
};

const sign = (claims: Record<string, unknown>) => crypto.jwt().sign(claims, AUTH_SECRET, { expiresIn: "1h" });

const makeReq = (authorization?: string, apiKey?: string) =>
  ({
    headers: {
      authorization,
      ...(apiKey ? { "x-api-key": apiKey } : {})
    }
  }) as unknown as FastifyRequest;

describe("extractAuth — OAuth access token classification", () => {
  beforeAll(async () => {
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  afterAll(() => {
    delete process.env.FIPS_ENABLED;
  });

  test("an access token carrying oauthClientId is classified as AuthMode.OAUTH", async () => {
    const token = sign({ ...baseAccessClaims, oauthClientId: "oauth_client_abc" });
    const result = await extractAuth(makeReq(`Bearer ${token}`), AUTH_SECRET);

    expect(result.authMode).toBe(AuthMode.OAUTH);
    expect((result.token as { oauthClientId?: string }).oauthClientId).toBe("oauth_client_abc");
  });

  test("a plain access token (no marker) remains a first-party AuthMode.JWT", async () => {
    const token = sign(baseAccessClaims);
    const result = await extractAuth(makeReq(`Bearer ${token}`), AUTH_SECRET);

    expect(result.authMode).toBe(AuthMode.JWT);
  });

  test("the MCP marker takes precedence over the OAuth marker", async () => {
    const token = sign({ ...baseAccessClaims, mcp: { endpointId: "ep-1" }, oauthClientId: "oauth_client_abc" });
    const result = await extractAuth(makeReq(`Bearer ${token}`), AUTH_SECRET);

    expect(result.authMode).toBe(AuthMode.MCP_JWT);
  });

  test("a service token is still detected by its st. prefix, never as OAuth", async () => {
    const result = await extractAuth(makeReq("Bearer st.some-service-token"), AUTH_SECRET);

    expect(result.authMode).toBe(AuthMode.SERVICE_TOKEN);
  });

  test("an x-api-key header short-circuits before token parsing", async () => {
    const token = sign({ ...baseAccessClaims, oauthClientId: "oauth_client_abc" });
    const result = await extractAuth(makeReq(`Bearer ${token}`, "my-api-key"), AUTH_SECRET);

    expect(result.authMode).toBe(AuthMode.API_KEY);
  });

  test("a missing authorization header yields no auth mode", async () => {
    const result = await extractAuth(makeReq(undefined), AUTH_SECRET);

    expect(result.authMode).toBeNull();
  });
});
