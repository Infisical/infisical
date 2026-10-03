import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator";

import { DynamicSecretOAuthSchema, OAuthClientAuthMethod, OAuthGrantType } from "./models";
import { OAuthProvider } from "./oauth";

const { appConfig } = vi.hoisted(() => ({ appConfig: { isDevelopmentMode: false } }));

vi.mock("@app/lib/config/env", () => ({ getConfig: () => appConfig }));

vi.mock("@app/lib/logger", async () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (
    await vi.importActual<typeof import("@app/lib/logger/sanitize-url")>("@app/lib/logger/sanitize-url")
  ).sanitizeUrlForLog
}));

// the crypto layer isn't initialised in the unit environment
vi.mock("@app/lib/crypto", async () => {
  const jwt = await vi.importActual<typeof import("jsonwebtoken")>("jsonwebtoken");
  return { crypto: { jwt: () => ({ decode: jwt.decode }) } };
});

vi.mock("@app/lib/validator", () => ({ safeRequest: { post: vi.fn() } }));

const mockedPost = vi.mocked(safeRequest.post);

const TOKEN_URL = "https://auth.example.com/oauth2/token";
const REVOCATION_URL = "https://auth.example.com/oauth2/revoke";

const baseInputs = {
  grantType: OAuthGrantType.ClientCredentials,
  tokenUrl: TOKEN_URL,
  revocationUrl: REVOCATION_URL,
  clientId: "infisical-client",
  clientAuth: { method: OAuthClientAuthMethod.ClientSecretBasic, clientSecret: "super-secret-value" },
  extraParams: []
};

const metadata = { projectId: "proj-1" };

const createArgs = (expireAt: number, inputs: object = baseInputs) => ({
  inputs,
  expireAt,
  identity: { name: "tester" },
  dynamicSecret: {} as TDynamicSecrets,
  metadata
});

const tokenResponse = (data: unknown) => ({ data }) as AxiosResponse;

const upstreamError = (status: number, data: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as AxiosResponse["config"]
  });

const jwtWithExp = (exp: number) =>
  [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: "client", exp })).toString("base64url"),
    ""
  ].join(".");

const decodeBasic = (header: unknown) => Buffer.from(String(header).replace("Basic ", ""), "base64").toString();

const callAt = (index: number) => {
  const [url, body, options] = mockedPost.mock.calls[index];
  return {
    url,
    body: new URLSearchParams(body as string),
    options: options as Record<string, unknown> & { headers: Record<string, string> }
  };
};

describe("OAuth dynamic secret schema", () => {
  test("normalizes scope by splitting on whitespace and removing duplicates", () => {
    const parsed = DynamicSecretOAuthSchema.parse({ ...baseInputs, scope: "  read   write\tread " });
    expect(parsed.scope).toBe("read write");
  });

  test("treats a blank scope as unset", () => {
    expect(DynamicSecretOAuthSchema.parse({ ...baseInputs, scope: "   " }).scope).toBeUndefined();
  });

  test("rejects scope tokens with characters outside RFC 6749 section 3.3", () => {
    expect(() => DynamicSecretOAuthSchema.parse({ ...baseInputs, scope: 'read "write"' })).toThrow(
      "Scope contains invalid characters"
    );
  });

  test.each(["grant_type", "scope", "client_id", "client_secret", "client_assertion", "Client_Assertion_Type"])(
    "rejects the reserved extra parameter %s",
    (key) => {
      expect(() => DynamicSecretOAuthSchema.parse({ ...baseInputs, extraParams: [{ key, value: "x" }] })).toThrow(
        "can't be used as an extra parameter"
      );
    }
  );

  test("rejects duplicate and excessive extra parameters", () => {
    expect(() =>
      DynamicSecretOAuthSchema.parse({
        ...baseInputs,
        extraParams: [
          { key: "audience", value: "a" },
          { key: "audience", value: "b" }
        ]
      })
    ).toThrow("set more than once");

    expect(() =>
      DynamicSecretOAuthSchema.parse({
        ...baseInputs,
        extraParams: Array.from({ length: 21 }, (_, index) => ({ key: `param${index}`, value: "x" }))
      })
    ).toThrow("At most 20 extra parameters");
  });
});

describe("OAuthProvider.validateProviderInputs", () => {
  beforeEach(() => {
    appConfig.isDevelopmentMode = false;
  });

  test("rejects http URLs outside development mode", async () => {
    await expect(
      OAuthProvider().validateProviderInputs({ ...baseInputs, tokenUrl: "http://auth.example.com/token" }, metadata)
    ).rejects.toThrow("Token URL must use https");
  });

  test("allows http URLs in development mode", async () => {
    appConfig.isDevelopmentMode = true;
    await expect(
      OAuthProvider().validateProviderInputs({ ...baseInputs, revocationUrl: "http://localhost:8080/revoke" }, metadata)
    ).resolves.toMatchObject({ revocationUrl: "http://localhost:8080/revoke" });
  });

  test("rejects a token URL change while leases are active", async () => {
    await expect(
      OAuthProvider().validateProviderInputs(
        { ...baseInputs, tokenUrl: "https://other.example.com/token" },
        { ...metadata, previousInputs: baseInputs, hasActiveLeases: true }
      )
    ).rejects.toThrow("can't be changed while this dynamic secret has active leases");
  });

  test("rejects a client ID change while leases are active", async () => {
    await expect(
      OAuthProvider().validateProviderInputs(
        { ...baseInputs, clientId: "rotated-client" },
        { ...metadata, previousInputs: baseInputs, hasActiveLeases: true }
      )
    ).rejects.toThrow("client ID can't be changed while this dynamic secret has active leases");
  });

  test("allows token URL and client ID changes when there are no leases", async () => {
    await expect(
      OAuthProvider().validateProviderInputs(
        { ...baseInputs, tokenUrl: "https://other.example.com/token", clientId: "rotated-client" },
        { ...metadata, previousInputs: baseInputs, hasActiveLeases: false }
      )
    ).resolves.toBeDefined();
  });

  test("allows rotating the secret, auth method and revocation URL while leases are active", async () => {
    await expect(
      OAuthProvider().validateProviderInputs(
        {
          ...baseInputs,
          revocationUrl: "https://auth.example.com/oauth2/v2/revoke",
          clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "rotated-secret" }
        },
        { ...metadata, previousInputs: baseInputs, hasActiveLeases: true }
      )
    ).resolves.toBeDefined();
  });
});

describe("OAuthProvider token request", () => {
  beforeEach(() => {
    mockedPost.mockReset();
    appConfig.isDevelopmentMode = false;
  });

  test("form-urlencodes client credentials before base64 encoding them", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token" }));

    await OAuthProvider().create(
      createArgs(Date.now() + 60_000, {
        ...baseInputs,
        clientId: "my client",
        clientAuth: { method: OAuthClientAuthMethod.ClientSecretBasic, clientSecret: "p+s%:w" }
      })
    );

    expect(decodeBasic(callAt(0).options.headers.Authorization)).toBe("my+client:p%2Bs%25%3Aw");
  });

  test("sends client credentials in the body without an Authorization header for client_secret_post", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token" }));

    await OAuthProvider().create(
      createArgs(Date.now() + 60_000, {
        ...baseInputs,
        clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "p+s%:w" }
      })
    );

    const { body, options } = callAt(0);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "client_credentials",
      client_id: "infisical-client",
      client_secret: "p+s%:w"
    });
    expect(options.headers).not.toHaveProperty("Authorization");
  });

  test("sends grant_type, normalized scope and extra params with retries disabled", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token" }));

    await OAuthProvider().create(
      createArgs(Date.now() + 60_000, {
        ...baseInputs,
        scope: "read write read",
        extraParams: [{ key: "audience", value: "https://api.example.com" }]
      })
    );

    const { url, body, options } = callAt(0);
    expect(url).toBe(TOKEN_URL);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "client_credentials",
      scope: "read write",
      audience: "https://api.example.com"
    });
    expect(body.has("client_secret")).toBe(false);
    expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(options["axios-retry"]).toEqual({ retries: 0 });
  });

  test("returns the token and derives EXPIRES_AT from expires_in", async () => {
    mockedPost.mockResolvedValueOnce(
      tokenResponse({ access_token: "opaque-access-token", token_type: "Bearer", expires_in: 3600, scope: "read" })
    );

    const before = Date.now();
    const { entityId, data } = await OAuthProvider().create(createArgs(Date.now() + 60_000));

    expect(entityId).toHaveLength(32);
    const leaseData = data as Record<string, string>;
    expect(leaseData).toMatchObject({ ACCESS_TOKEN: "opaque-access-token", TOKEN_TYPE: "Bearer", SCOPE: "read" });
    const expiresAt = new Date(leaseData.EXPIRES_AT).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 3_600_000);
  });

  test("falls back to the JWT exp claim when expires_in is missing", async () => {
    const exp = Math.floor(Date.now() / 1000) + 1800;
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: jwtWithExp(exp) }));

    const { data } = await OAuthProvider().create(createArgs(Date.now() + 60_000));

    expect((data as Record<string, string>).EXPIRES_AT).toBe(new Date(exp * 1000).toISOString());
  });

  test("skips the TTL check when the lifetime is unknown", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token" }));

    const { data } = await OAuthProvider().create(createArgs(Date.now() + 365 * 24 * 3_600_000));

    expect(data).not.toHaveProperty("EXPIRES_AT");
    expect(mockedPost).toHaveBeenCalledOnce();
  });

  test("accepts a lease TTL within the 60s clock skew tolerance", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token", expires_in: 3599 }));

    await expect(OAuthProvider().create(createArgs(Date.now() + 3_600_000))).resolves.toBeDefined();
  });

  test("rejects a lease TTL longer than the token lifetime and revokes the token", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse({ access_token: "opaque-access-token", expires_in: 1800 }))
      .mockResolvedValueOnce(tokenResponse(""));

    await expect(OAuthProvider().create(createArgs(Date.now() + 3_600_000))).rejects.toThrow(
      /lease TTL \(3600s\) is longer than the lifetime of the access tokens the authorization server issues \(1800s\)/
    );

    expect(mockedPost).toHaveBeenCalledTimes(2);
    const { url, body } = callAt(1);
    expect(url).toBe(REVOCATION_URL);
    expect(body.get("token")).toBe("opaque-access-token");
  });

  test("maps RFC 6749 token errors to a readable message without leaking credentials", async () => {
    mockedPost.mockRejectedValueOnce(
      upstreamError(401, {
        error: "invalid_client",
        error_description: "Client authentication failed for super-secret-value"
      })
    );

    const result = OAuthProvider().create(createArgs(Date.now() + 60_000));

    await expect(result).rejects.toBeInstanceOf(BadRequestError);
    await expect(result).rejects.toThrow(/rejected the token request: invalid_client: Client authentication failed/);
    await expect(result).rejects.not.toThrow(/super-secret-value/);
  });

  test("rejects a token response without an access_token", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse({ token_type: "Bearer" }));

    await expect(OAuthProvider().create(createArgs(Date.now() + 60_000))).rejects.toThrow("without an access_token");
  });
});

describe("OAuthProvider.revoke", () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  test("posts the stored token to the revocation endpoint with an access_token hint", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse(""));

    await OAuthProvider().revoke(baseInputs, "entity-1", { ...metadata, leaseData: { ACCESS_TOKEN: "stored-token" } });

    const { url, body, options } = callAt(0);
    expect(url).toBe(REVOCATION_URL);
    expect(Object.fromEntries(body)).toEqual({ token: "stored-token", token_type_hint: "access_token" });
    expect(decodeBasic(options.headers.Authorization)).toBe("infisical-client:super-secret-value");
    expect(options).not.toHaveProperty("axios-retry");
  });

  test("authenticates the revocation request the same way as the token request for client_secret_post", async () => {
    mockedPost.mockResolvedValueOnce(tokenResponse(""));

    await OAuthProvider().revoke(
      { ...baseInputs, clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "post-secret" } },
      "entity-1",
      { ...metadata, leaseData: { ACCESS_TOKEN: "stored-token" } }
    );

    const { body, options } = callAt(0);
    expect(Object.fromEntries(body)).toEqual({
      token: "stored-token",
      token_type_hint: "access_token",
      client_id: "infisical-client",
      client_secret: "post-secret"
    });
    expect(options.headers).not.toHaveProperty("Authorization");
  });

  test("redacts a client_secret_post secret from revocation errors", async () => {
    mockedPost.mockRejectedValueOnce(
      upstreamError(401, { error: "invalid_client", error_description: "unknown secret post-secret-value" })
    );

    const result = OAuthProvider().revoke(
      {
        ...baseInputs,
        clientAuth: { method: OAuthClientAuthMethod.ClientSecretPost, clientSecret: "post-secret-value" }
      },
      "entity-1",
      { ...metadata, leaseData: { ACCESS_TOKEN: "stored-token" } }
    );

    await expect(result).rejects.toThrow("[REDACTED]");
    await expect(result).rejects.not.toThrow("post-secret-value");
  });

  test("rejects an unknown client auth method", async () => {
    await expect(
      OAuthProvider().revoke(
        { ...baseInputs, clientAuth: { method: "private_key_jwt", privateKey: "key" } },
        "entity-1",
        { ...metadata, leaseData: { ACCESS_TOKEN: "stored-token" } }
      )
    ).rejects.toThrow();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("throws a readable error when the lease has no stored token", async () => {
    await expect(OAuthProvider().revoke(baseInputs, "entity-1", metadata)).rejects.toThrow(
      "This lease has no stored access token"
    );
    expect(mockedPost).not.toHaveBeenCalled();
  });

  test("redacts the access token from revocation errors", async () => {
    const accessToken = jwtWithExp(Math.floor(Date.now() / 1000) + 60);
    mockedPost.mockRejectedValueOnce(
      upstreamError(400, { error: "invalid_request", error_description: `bad token ${accessToken}` })
    );

    const result = OAuthProvider().revoke(baseInputs, "entity-1", {
      ...metadata,
      leaseData: { ACCESS_TOKEN: accessToken }
    });

    await expect(result).rejects.toThrow("[REDACTED]");
    await expect(result).rejects.not.toThrow(accessToken);
  });
});

describe("OAuthProvider.validateConnection", () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });

  test("issues a test token, checks the TTLs and revokes it", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse({ access_token: "test-token", expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse(""));

    await expect(
      OAuthProvider().validateConnection(baseInputs, { ...metadata, defaultTTL: "30m", maxTTL: "1h" })
    ).resolves.toBe(true);

    expect(callAt(1).url).toBe(REVOCATION_URL);
    expect(callAt(1).body.get("token")).toBe("test-token");
  });

  test("rejects a max TTL longer than the token lifetime", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse({ access_token: "test-token", expires_in: 3600 }))
      .mockResolvedValueOnce(tokenResponse(""));

    await expect(
      OAuthProvider().validateConnection(baseInputs, { ...metadata, defaultTTL: "30m", maxTTL: "2h" })
    ).rejects.toThrow(/max TTL \(7200s\)/);
    expect(callAt(1).url).toBe(REVOCATION_URL);
  });

  test("rejects authorization servers that can't revoke access tokens", async () => {
    mockedPost
      .mockResolvedValueOnce(tokenResponse({ access_token: "test-token", expires_in: 3600 }))
      .mockRejectedValueOnce(upstreamError(400, { error: "unsupported_token_type" }));

    await expect(OAuthProvider().validateConnection(baseInputs, { ...metadata, defaultTTL: "30m" })).rejects.toThrow(
      /couldn't revoke it.*doesn't support revoking access tokens \(unsupported_token_type\)/
    );
  });
});

describe("OAuthProvider.renew", () => {
  test("is not supported", async () => {
    await expect(OAuthProvider().renew(baseInputs, "entity-1", Date.now(), metadata)).rejects.toThrow(
      "OAuth access tokens can't be extended"
    );
  });
});
