import crypto from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { PRIVATE_ADDRESS_REFUSED_MESSAGE } from "@app/lib/validator";

import { AgentVaultCredentialType, AgentVaultOauthStatus } from "../agent-vault/agent-vault-enums";
import { TOauthHttpClient, TOauthHttpResponse } from "./agent-vault-oauth-http-fns";
import {
  buildAuthorizeUrl,
  decideRefresh,
  exchangeAuthorizationCode,
  expiresAtFrom,
  formUrlEncode,
  generatePkce,
  generateState,
  hashAccessToken,
  isSameState,
  MAX_EXPIRES_IN_SECONDS,
  MAX_GRANTED_OAUTH_SCOPES,
  normalizeProviderText,
  parseExpiresIn,
  parseGrantedScopes,
  parseTokenResponse,
  requestToken,
  toResolvedOauthCredential,
  validateCallbackIssuer,
  withTokenCompatibility
} from "./agent-vault-oauth-token-fns";
import { AgentVaultOauthClientAuthMethod, AgentVaultOauthCompatibility } from "./agent-vault-oauth-types";

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

type TCall = { url: string; form?: URLSearchParams; json?: unknown; headers?: Record<string, string> };

const stubPosts = (responses: TOauthHttpResponse[]) => {
  const calls: TCall[] = [];
  const next = () => {
    const response = responses.shift();
    if (!response) throw new Error("no more stubbed responses");
    return response;
  };
  const http: TOauthHttpClient = {
    probe: async () => ({ status: 401, wwwAuthenticate: null }),
    get: async () => next(),
    postForm: async (url, form, headers) => {
      calls.push({ url, form, headers });
      return next();
    },
    postJson: async (url, json) => {
      calls.push({ url, json });
      return next();
    }
  };
  return { http, calls };
};

const json = (status: number, body: unknown): TOauthHttpResponse => ({
  status,
  contentType: "application/json",
  body: JSON.stringify(body)
});

const tokenArgs = {
  issuer: "https://auth.example.com",
  tokenEndpoint: "https://auth.example.com/token",
  params: { grant_type: "refresh_token", refresh_token: "rt-1" },
  clientId: "client-1",
  tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.None,
  resource: "https://mcp.example.com/mcp"
};

describe("PKCE and state", () => {
  test("the challenge is the S256 of the verifier", () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(codeChallenge).toBe(crypto.createHash("sha256").update(codeVerifier).digest("base64url"));
  });

  test("state carries the authorization id before the first dot, and compares whole", () => {
    const id = "6f1f8b4e-2f6c-4c55-9d61-1f6a2b7c9d10";
    const state = generateState(id);
    expect(state.split(".")[0]).toBe(id);
    expect(state.split(".")[1].length).toBeGreaterThanOrEqual(43);
    expect(isSameState(state, state)).toBe(true);
    expect(isSameState(state, `${state}x`)).toBe(false);
    expect(isSameState(state, `${id}.forged`)).toBe(false);
  });

  test("the token hash is lowercase hex sha256", () => {
    expect(hashAccessToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("the authorize URL", () => {
  test("carries PKCE S256, state, resource and scopes, and keeps the endpoint's own query", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: "https://auth.example.com/authorize?tenant=x",
        clientId: "client-1",
        redirectUri: "https://app.infisical.com/agent-vault/oauth/callback",
        codeChallenge: "challenge",
        state: "id.random",
        resource: "https://mcp.example.com/mcp",
        scopes: ["read", "write"]
      })
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      tenant: "x",
      response_type: "code",
      client_id: "client-1",
      redirect_uri: "https://app.infisical.com/agent-vault/oauth/callback",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      state: "id.random",
      resource: "https://mcp.example.com/mcp",
      scope: "read write"
    });
  });

  test("offline_access asks for consent, which OIDC requires before it issues a refresh token", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: "https://auth.example.com/authorize",
        clientId: "client-1",
        redirectUri: "https://app.infisical.com/agent-vault/oauth/callback",
        codeChallenge: "challenge",
        state: "id.random",
        resource: null,
        scopes: ["read", "offline_access"]
      })
    );
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  test("no scopes and no resource leave both out", () => {
    const url = new URL(
      buildAuthorizeUrl({
        authorizationEndpoint: "https://auth.example.com/authorize",
        clientId: "c",
        redirectUri: "https://x/cb",
        codeChallenge: "c",
        state: "s",
        resource: null,
        scopes: []
      })
    );
    expect(url.searchParams.has("scope")).toBe(false);
    expect(url.searchParams.has("resource")).toBe(false);
  });
});

describe("iss in the callback (RFC 9207)", () => {
  const base = { expectedIssuer: "https://auth.example.com", serverUrl: "https://mcp.example.com/mcp" };

  test.each([
    { iss: "https://auth.example.com", supported: true, ok: true, why: "matches" },
    { iss: "https://auth.example.com/", supported: true, ok: true, why: "matches but for a trailing slash" },
    { iss: "https://auth.example.com", supported: false, ok: true, why: "sent though not advertised" },
    { iss: "https://evil.example.com", supported: true, ok: false, why: "names another issuer" },
    { iss: "https://evil.example.com", supported: false, ok: false, why: "names another issuer, unadvertised" },
    { iss: undefined, supported: true, ok: false, why: "missing though advertised" },
    { iss: undefined, supported: false, ok: true, why: "missing and never advertised" }
  ])("$why", ({ iss, supported, ok }) => {
    const problem = validateCallbackIssuer({ ...base, iss, issParameterSupported: supported });
    expect(problem === null).toBe(ok);
  });
});

describe("token requests", () => {
  test("a JSON response, a public client sending client_id and resource in the form", async () => {
    const { http, calls } = stubPosts([
      json(200, { access_token: "at-2", token_type: "Bearer", expires_in: 3600, refresh_token: "rt-2", scope: "read" })
    ]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(result).toEqual({
      ok: true,
      tokens: { accessToken: "at-2", refreshToken: "rt-2", expiresIn: 3600, scopes: ["read"] },
      resourceDropped: false
    });
    expect(Object.fromEntries(calls[0].form!)).toEqual({
      grant_type: "refresh_token",
      refresh_token: "rt-1",
      resource: "https://mcp.example.com/mcp",
      client_id: "client-1"
    });
    expect(new Headers(calls[0].headers).has("authorization")).toBe(false);
    expect(new Headers(calls[0].headers).get("content-type")).toContain("application/x-www-form-urlencoded");
  });

  test("a form-encoded response is parsed, and GitHub's comma-joined scopes split as a recorded fallback", async () => {
    const { http } = stubPosts([
      {
        status: 200,
        contentType: "application/x-www-form-urlencoded; charset=utf-8",
        body: "access_token=gho_abc&token_type=bearer&scope=repo%2Cgist"
      }
    ]);
    const result = await requestToken({ http, ...tokenArgs, requestedScopes: ["repo", "gist", "user"] });
    expect(result.ok && result.tokens).toEqual({
      accessToken: "gho_abc",
      refreshToken: undefined,
      expiresIn: undefined,
      scopes: ["repo", "gist"],
      scopesCommaSeparated: true
    });
  });

  test("an error code is normalized like the description, and still branches", async () => {
    const { http } = stubPosts([json(400, { error: "invalid_grant\u0000\ud800" })]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(result).toMatchObject({
      ok: false,
      errorCode: "invalid_grant",
      message: "The login server 'auth.example.com' refused the token request: invalid_grant"
    });
  });

  test("an error code with nothing printable falls back to the HTTP status", async () => {
    const { http } = stubPosts([json(400, { error: "\u0000‮" })]);
    expect(await requestToken({ http, ...tokenArgs })).toMatchObject({
      ok: false,
      errorCode: null,
      message: "The login server 'auth.example.com' refused the token request: HTTP 400"
    });
  });

  test("a 5xx with no OAuth error reads as an outage, not a refusal", async () => {
    const { http } = stubPosts([json(503, {})]);
    expect(await requestToken({ http, ...tokenArgs })).toMatchObject({
      ok: false,
      errorCode: null,
      message: "The login server 'auth.example.com' is having trouble right now (HTTP 503)."
    });
  });

  test("a 5xx that names an OAuth error still quotes it", async () => {
    const { http } = stubPosts([json(503, { error: "temporarily_unavailable" })]);
    expect(await requestToken({ http, ...tokenArgs })).toMatchObject({
      errorCode: "temporarily_unavailable",
      message: "The login server 'auth.example.com' refused the token request: temporarily_unavailable"
    });
  });

  test("an access token that can't go into a header is refused, and a bad refresh token is dropped", async () => {
    const refused = stubPosts([json(200, { access_token: "a\r\nX-Evil: 1", token_type: "bearer" })]);
    expect((await requestToken({ http: refused.http, ...tokenArgs })).ok).toBe(false);

    const dropped = stubPosts([json(200, { access_token: "a", token_type: "bearer", refresh_token: "r\u0000" })]);
    const result = await requestToken({ http: dropped.http, ...tokenArgs });
    expect(result.ok && result.tokens.refreshToken).toBeUndefined();
  });

  test.each(["\n", "\r\n"])("a token ending in %j is refused", async (suffix) => {
    const { http } = stubPosts([json(200, { access_token: `access-token${suffix}` })]);
    expect((await requestToken({ http, ...tokenArgs })).ok).toBe(false);
  });

  test("a long secret echoed in the error code is redacted before it is truncated", async () => {
    const refreshToken = `rt-${"x".repeat(160)}`;
    const { http } = stubPosts([json(400, { error: `Refused ${refreshToken}` })]);
    const result = await requestToken({
      http,
      ...tokenArgs,
      params: { grant_type: "refresh_token", refresh_token: refreshToken }
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).not.toContain("xxxxxxxx");
    expect(result.errorCode).not.toContain("xxxxxxxx");
  });

  test("provider refusals cannot expose request secrets or their Basic authorization header", async () => {
    const clientSecret = "client +/secret-with_.*";
    const encoded = new URLSearchParams({ value: clientSecret }).toString().slice("value=".length);
    // oauth4webapi escapes - _ . * in the Basic header, which URLSearchParams leaves alone.
    const basic = Buffer.from("client%2D1:client+%2B%2Fsecret%2Dwith%5F%2E%2A").toString("base64");
    const { http } = stubPosts([
      json(400, {
        error: "invalid_grant",
        error_description: `Refused ${clientSecret}, ${encoded}, ${basic}, rt-1 and current-access`
      })
    ]);
    const result = await requestToken({
      http,
      ...tokenArgs,
      clientSecret,
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic,
      sensitiveValues: ["current-access"]
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errorCode).toBe("invalid_grant");
    [clientSecret, encoded, basic, "rt-1", "current-access"].forEach((secret) =>
      expect(result.message).not.toContain(secret)
    );
  });

  test("granted scopes that aren't OAuth scope tokens are dropped rather than stored", async () => {
    const { http } = stubPosts([
      json(200, { access_token: "at-2", token_type: "Bearer", scope: 'read \u0000 wr"ite a\\b\twrite read' })
    ]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(result.ok && result.tokens.scopes).toEqual(["read"]);
  });

  test("client_secret_basic form-encodes both halves into the header", async () => {
    const { http, calls } = stubPosts([json(200, { access_token: "a", token_type: "bearer" })]);
    await requestToken({
      http,
      ...tokenArgs,
      clientId: "id:1-a",
      clientSecret: "s&2_b.c*",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
    });
    expect(new Headers(calls[0].headers).get("authorization")).toBe(
      `Basic ${Buffer.from(`${formUrlEncode("id:1-a")}:${formUrlEncode("s&2_b.c*")}`).toString("base64")}`
    );
    expect(formUrlEncode("id:1-a s&2_b.c*!~'()")).toBe("id%3A1%2Da+s%262%5Fb%2Ec%2A%21%7E%27%28%29");
    expect(calls[0].form!.has("client_secret")).toBe(false);
  });

  test("client_secret_post puts the secret in the form", async () => {
    const { http, calls } = stubPosts([json(200, { access_token: "a", token_type: "bearer" })]);
    await requestToken({
      http,
      ...tokenArgs,
      clientSecret: "s",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretPost
    });
    expect(calls[0].form!.get("client_secret")).toBe("s");
  });

  test("client_secret_basic uses form encoding for spaces and reserved characters", async () => {
    const { http, calls } = stubPosts([json(200, { access_token: "a", token_type: "bearer" })]);
    await requestToken({
      http,
      ...tokenArgs,
      clientId: "id :!~",
      clientSecret: "s &'()",
      tokenEndpointAuthMethod: AgentVaultOauthClientAuthMethod.ClientSecretBasic
    });
    expect(new Headers(calls[0].headers).get("authorization")).toBe(
      `Basic ${Buffer.from("id+%3A%21%7E:s+%26%27%28%29").toString("base64")}`
    );
  });

  test("code exchange sends the code, redirect URI and PKCE verifier instead of refresh parameters", async () => {
    const { http, calls } = stubPosts([json(200, { access_token: "a", token_type: "bearer" })]);
    const result = await exchangeAuthorizationCode({
      http,
      ...tokenArgs,
      code: "code-1",
      codeVerifier: "verifier-1",
      redirectUri: "https://app.infisical.com/agent-vault/oauth/callback"
    });
    expect(result.ok).toBe(true);
    expect(Object.fromEntries(calls[0].form!)).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      code_verifier: "verifier-1",
      redirect_uri: "https://app.infisical.com/agent-vault/oauth/callback",
      client_id: "client-1",
      resource: tokenArgs.resource
    });
  });

  test("invalid_target is retried once without resource", async () => {
    const { http, calls } = stubPosts([
      json(400, { error: "invalid_target" }),
      json(200, { access_token: "a", token_type: "bearer" })
    ]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(result.ok).toBe(true);
    expect(result.resourceDropped).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].form!.has("resource")).toBe(true);
    expect(calls[1].form!.has("resource")).toBe(false);
  });

  test("an error in a 200 body (GitHub) is a failure with its code", async () => {
    const { http } = stubPosts([
      json(200, { error: "bad_verification_code", error_description: "The code passed is incorrect or expired." })
    ]);
    expect(await requestToken({ http, ...tokenArgs })).toEqual({
      ok: false,
      errorCode: "bad_verification_code",
      message:
        "The login server 'auth.example.com' refused the token request: The code passed is incorrect or expired.",
      resourceDropped: false
    });
  });

  test("a grant of more scopes than a reauthorize can ask for is refused rather than stored", async () => {
    const scopes = (count: number) => Array.from({ length: count }, (_, i) => `scope-${i}`).join(" ");
    const { http } = stubPosts([
      json(200, { access_token: "at-2", token_type: "Bearer", scope: scopes(MAX_GRANTED_OAUTH_SCOPES) }),
      json(200, { access_token: "at-3", token_type: "Bearer", scope: scopes(MAX_GRANTED_OAUTH_SCOPES + 1) })
    ]);

    const atLimit = await requestToken({ http, ...tokenArgs });
    expect(atLimit.ok && atLimit.tokens.scopes).toHaveLength(MAX_GRANTED_OAUTH_SCOPES);

    const overLimit = await requestToken({ http, ...tokenArgs });
    expect(overLimit).toMatchObject({
      ok: false,
      errorCode: null,
      message: `The login server 'auth.example.com' granted ${MAX_GRANTED_OAUTH_SCOPES + 1} OAuth scopes, more than the ${MAX_GRANTED_OAUTH_SCOPES} Infisical supports.`
    });
  });

  test("a non-bearer token is refused", async () => {
    const { http } = stubPosts([json(200, { access_token: "a", token_type: "DPoP" })]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(result.ok).toBe(false);
  });

  test("provider text is stripped of control characters and bounded", async () => {
    const { http } = stubPosts([json(400, { error: "x", error_description: `bad\n${"a".repeat(500)}` })]);
    const result = await requestToken({ http, ...tokenArgs });
    expect(!result.ok && result.message).not.toContain("\n");
    expect(!result.ok && result.message.length).toBeLessThan(400);
  });

  test("a network failure is a readable failure, not a throw", async () => {
    const http: TOauthHttpClient = {
      ...stubPosts([]).http,
      postForm: async () => {
        throw new Error("ETIMEDOUT");
      }
    };
    const result = await requestToken({ http, ...tokenArgs });
    expect(!result.ok && result.message).toBe("Couldn't reach the login server 'auth.example.com'.");
  });

  test("a private login server is named as the reason, since retrying can't help", async () => {
    const http: TOauthHttpClient = {
      ...stubPosts([]).http,
      postForm: async () => {
        throw new BadRequestError({ message: PRIVATE_ADDRESS_REFUSED_MESSAGE });
      }
    };
    const result = await requestToken({ http, ...tokenArgs });
    expect(!result.ok && result.message).toBe(
      "Infisical can't reach the login server 'auth.example.com' because it's on a private network. Use a bearer token for this service instead."
    );
  });

  test("the reason a request never got an answer is logged, without the URL path or request secrets", async () => {
    const http: TOauthHttpClient = {
      ...stubPosts([]).http,
      postForm: async () => {
        throw new Error("certificate has expired while sending rt-1");
      }
    };
    vi.mocked(logger.info).mockClear();
    await requestToken({ http, ...tokenArgs, tokenEndpoint: "https://auth.example.com/tenant-secret/token" });
    const line = vi
      .mocked(logger.info)
      .mock.calls.map(([message]) => String(message))
      .join("\n");
    expect(line).toContain("certificate has expired");
    expect(line).toContain("https://auth.example.com");
    expect(line).not.toContain("tenant-secret");
    expect(line).not.toContain("rt-1");
  });

  test("a server that never answers fails inside the budget, and each request gets only what is left of it", async () => {
    const timeouts: number[] = [];
    const http: TOauthHttpClient = {
      ...stubPosts([]).http,
      postForm: (_url, _form, _headers, options) => {
        timeouts.push(options?.timeoutMs ?? -1);
        return new Promise(() => {});
      }
    };
    const startedAt = Date.now();
    const result = await requestToken({ http, ...tokenArgs, budgetMs: 50 });
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(!result.ok && result.message).toBe("Couldn't reach the login server 'auth.example.com'.");
    expect(timeouts).toHaveLength(1);
    expect(timeouts[0]).toBeLessThanOrEqual(50);
  });

  test("invalid_target isn't retried once the budget is nearly spent", async () => {
    const { http, calls } = stubPosts([json(400, { error: "invalid_target" })]);
    const result = await requestToken({ http, ...tokenArgs, budgetMs: 100 });
    expect(!result.ok && result.errorCode).toBe("invalid_target");
    expect(calls).toHaveLength(1);
  });

  test("an invalid_target retry receives only the remaining timeout budget", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    const { http } = stubPosts([json(400, { error: "invalid_target" }), json(200, { access_token: "a" })]);
    const { postForm } = http;
    const timeouts: number[] = [];
    http.postForm = async (url, form, headers, options) => {
      timeouts.push(options?.timeoutMs ?? -1);
      now.mockReturnValue(1600);
      return postForm(url, form, headers, options);
    };
    try {
      const result = await requestToken({ http, ...tokenArgs, budgetMs: 1200 });
      expect(result.ok).toBe(true);
      expect(timeouts).toEqual([1200, 600]);
    } finally {
      now.mockRestore();
    }
  });
});

describe("token types", () => {
  test.each(["Bearer", "bearer", "user", "N_A", undefined])("a %s token is used as a bearer token", (tokenType) => {
    expect(parseTokenResponse({ access_token: "xoxp-1", token_type: tokenType })?.accessToken).toBe("xoxp-1");
  });

  test.each(["DPoP", "mac", "PoP"])("a %s token is refused, since it needs proof the proxy can't give", (tokenType) => {
    expect(parseTokenResponse({ access_token: "at", token_type: tokenType })).toBeNull();
  });

  test("a Slack user token reports the scopes granted under authed_user, not every scope requested", () => {
    const tokens = parseTokenResponse(
      { ok: true, access_token: "xoxp-1", token_type: "user", authed_user: { id: "U123", scope: "openid,email" } },
      ["openid", "email", "profile"]
    );
    expect(tokens?.scopes).toEqual(["openid", "email"]);
    expect(tokens?.scopesCommaSeparated).toBe(true);
  });
});

describe("text from a provider", () => {
  test("Unicode whitespace becomes spaces while ordinary replacement characters survive", () => {
    expect(normalizeProviderText("read\u00a0write\u2028next\ufeffstep\vlast �")).toBe("read write next step last �");
  });

  test("literal and encoded secrets are removed before truncation, and URLs lose paths and query values", () => {
    const secret = "refresh +/token";
    const encoded = new URLSearchParams({ value: secret }).toString().slice("value=".length);
    const normalized = normalizeProviderText(
      `Refused ${secret}, ${encoded} and https://auth.example.com/secret-in-path?token=query-secret`,
      500,
      [secret]
    );
    expect(normalized).toContain("[redacted]");
    expect(normalized).not.toContain(secret);
    expect(normalized).not.toContain(encoded);
    expect(normalized).not.toContain("secret-in-path");
    expect(normalized).not.toContain("query-secret");
    expect(normalizeProviderText(`bad ${secret}`, 10, [secret])).toBe("bad [redac");
  });
  test("line breaks and tabs become spaces, other control and formatting characters go, and it is bounded", () => {
    expect(normalizeProviderText("The user\r\n\tdeclined‮  the​ request\u0007")).toBe("The user declined the request");
    expect(normalizeProviderText("é ünïcode stays")).toBe("é ünïcode stays");
    expect(normalizeProviderText("a".repeat(5000))).toHaveLength(500);
    expect(normalizeProviderText("a".repeat(5000), 100)).toHaveLength(100);
    expect(normalizeProviderText(undefined)).toBe("");
    expect(normalizeProviderText(42)).toBe("");
  });

  test("NUL and lone surrogates, which jsonb can't hold, never survive", () => {
    const normalized = normalizeProviderText("a\u0000b \ud800c \udfffd 😀");
    expect(normalized).toBe("a b c d 😀");
    expect(JSON.stringify(normalized)).not.toMatch(/\\u0000|\\ud[89ab]/i);
  });
});

describe("expires_in", () => {
  test.each([
    { value: 3600, expected: 3600 },
    { value: "3600", expected: 3600 },
    { value: 3599.9, expected: 3599 },
    { value: MAX_EXPIRES_IN_SECONDS, expected: MAX_EXPIRES_IN_SECONDS },
    { value: MAX_EXPIRES_IN_SECONDS + 1, expected: undefined },
    { value: 1e20, expected: undefined },
    { value: "1e20", expected: undefined },
    { value: Number.MAX_VALUE, expected: undefined },
    { value: Infinity, expected: undefined },
    { value: 0, expected: undefined },
    { value: 0.5, expected: undefined },
    { value: -60, expected: undefined },
    { value: "", expected: undefined },
    { value: " ", expected: undefined },
    { value: "soon", expected: undefined },
    { value: null, expected: undefined },
    { value: true, expected: undefined }
  ])("$value is $expected", ({ value, expected }) => {
    expect(parseExpiresIn(value)).toBe(expected);
  });

  test("an expiry that isn't a date is no expiry rather than a throw", () => {
    const now = new Date("2026-10-15T12:00:00Z");
    expect(expiresAtFrom(60, now)).toBe("2026-10-15T12:01:00.000Z");
    expect(expiresAtFrom(1e20, now)).toBeNull();
    expect(expiresAtFrom(undefined, now)).toBeNull();
  });
});

describe("granted scopes", () => {
  test.each(["\t", "\n", "\r", "\u00a0"])("only a space separates scopes, not %j", (separator) => {
    expect(parseGrantedScopes(`read${separator}write`)).toEqual({ scopes: [], commaSeparated: false });
  });
  test("split on spaces, so a comma inside a scope token stays", () => {
    expect(parseGrantedScopes("read:a,b write", ["read:a,b", "write"])).toEqual({
      scopes: ["read:a,b", "write"],
      commaSeparated: false
    });
    expect(parseGrantedScopes("a,b", [])).toEqual({ scopes: ["a,b"], commaSeparated: false });
  });

  test("a comma-joined value that was itself requested stays one scope", () => {
    expect(parseGrantedScopes("a,b", ["a,b", "a", "b"])).toEqual({ scopes: ["a,b"], commaSeparated: false });
  });

  test("a comma-joined value splits only when every part was requested", () => {
    expect(parseGrantedScopes("repo,gist", ["repo", "gist", "user"])).toEqual({
      scopes: ["repo", "gist"],
      commaSeparated: true
    });
    expect(parseGrantedScopes("repo,admin", ["repo", "gist"])).toEqual({
      scopes: ["repo,admin"],
      commaSeparated: false
    });
  });

  test("no scope parameter is no scopes", () => {
    expect(parseGrantedScopes(undefined, ["read"])).toEqual({ commaSeparated: false });
  });

  test("each fallback is recorded once", () => {
    expect(
      withTokenCompatibility([AgentVaultOauthCompatibility.ResourceRejected], {
        resourceDropped: true,
        scopesCommaSeparated: true
      })
    ).toEqual([AgentVaultOauthCompatibility.ResourceRejected, AgentVaultOauthCompatibility.ScopeCommaSeparated]);
    const unchanged: AgentVaultOauthCompatibility[] = [];
    expect(withTokenCompatibility(unchanged, { resourceDropped: false })).toBe(unchanged);
  });
});

describe("the resolved credential", () => {
  test("is a bearer credential a proxy without OAuth support injects as is", () => {
    expect(toResolvedOauthCredential({ expiresAt: "2026-10-21T00:00:00.000Z" }, "access-token")).toEqual({
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bearer",
      value: "access-token",
      source: AgentVaultCredentialType.OAuth,
      expiresAt: "2026-10-21T00:00:00.000Z"
    });
  });

  test("reports no expiry when the stored config has none", () => {
    expect(
      toResolvedOauthCredential({} as Parameters<typeof toResolvedOauthCredential>[0], "access-token").expiresAt
    ).toBeNull();
  });
});

describe("refresh decisions", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const base = {
    status: AgentVaultOauthStatus.Connected,
    expiresAt: "2026-10-15T13:00:00Z",
    accessTokenHash: "current",
    hasRefreshToken: true,
    now
  };

  test("lazy: a token valid past the horizon is left alone", () => {
    expect(decideRefresh({ ...base, expiresWithinSeconds: 120 })).toEqual({ action: "return-current" });
  });

  test("lazy: a token expiring within the horizon is refreshed", () => {
    expect(decideRefresh({ ...base, expiresAt: "2026-10-15T12:01:00Z", expiresWithinSeconds: 120 })).toEqual({
      action: "refresh"
    });
  });

  test("lazy: no expiry means refresh only on rejection", () => {
    expect(decideRefresh({ ...base, expiresAt: null, expiresWithinSeconds: 120 })).toEqual({
      action: "return-current"
    });
  });

  test("lazy: no refresh token works until expiry, then needs reauthorization", () => {
    expect(
      decideRefresh({ ...base, hasRefreshToken: false, expiresAt: "2026-10-15T12:01:00Z", expiresWithinSeconds: 120 })
    ).toEqual({ action: "return-current" });
    expect(
      decideRefresh({ ...base, hasRefreshToken: false, expiresAt: "2026-10-15T11:59:00Z", expiresWithinSeconds: 120 })
        .action
    ).toBe("needs-reauthorization");
  });

  test("on demand: a rejected token that is no longer current returns the current one", () => {
    expect(decideRefresh({ ...base, rejectedTokenHash: "older" })).toEqual({ action: "return-current" });
  });

  test("on demand: the current token rejected is refreshed, or needs reauthorization without a refresh token", () => {
    expect(decideRefresh({ ...base, rejectedTokenHash: "current" })).toEqual({ action: "refresh" });
    expect(decideRefresh({ ...base, hasRefreshToken: false, rejectedTokenHash: "current" }).action).toBe(
      "needs-reauthorization"
    );
  });

  test("a service that needs reauthorization is never refreshed", () => {
    expect(
      decideRefresh({ ...base, status: AgentVaultOauthStatus.NeedsReauthorization, rejectedTokenHash: "current" })
    ).toEqual({ action: "return-current" });
  });
});
