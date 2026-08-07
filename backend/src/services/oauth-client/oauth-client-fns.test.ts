import crypto from "node:crypto";

import {
  assertValidOauthClientGrantConfig,
  computePkceChallenge,
  isAllowedRedirectUri,
  isRegisteredRedirectUri,
  parseBasicAuthHeader
} from "./oauth-client-fns";
import { OauthGrantType } from "./oauth-client-types";

describe("parseBasicAuthHeader", () => {
  test("parses a valid Basic auth header", () => {
    const header = `Basic ${Buffer.from("my-client:my-secret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "my-client", clientSecret: "my-secret" });
  });

  test("decodes form-urlencoded credentials", () => {
    const header = `Basic ${Buffer.from("client%3Aid:se%2Fcret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "client:id", clientSecret: "se/cret" });
  });

  test("handles secrets containing colons", () => {
    const header = `Basic ${Buffer.from("client:sec:ret").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toEqual({ clientId: "client", clientSecret: "sec:ret" });
  });

  test("returns null for missing header", () => {
    expect(parseBasicAuthHeader(undefined)).toBeNull();
  });

  test("returns null for Bearer header", () => {
    expect(parseBasicAuthHeader("Bearer some-jwt")).toBeNull();
  });

  test("returns null when credentials have no separator", () => {
    const header = `Basic ${Buffer.from("no-separator").toString("base64")}`;
    expect(parseBasicAuthHeader(header)).toBeNull();
  });
});

describe("computePkceChallenge", () => {
  test("computes the S256 challenge of a verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = crypto.createHash("sha256").update(verifier).digest("base64url");
    expect(computePkceChallenge(verifier)).toEqual(expected);
  });

  test("matches the RFC 7636 appendix B test vector", () => {
    expect(computePkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toEqual(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
});

describe("isAllowedRedirectUri", () => {
  test("allows https for any host", () => {
    expect(isAllowedRedirectUri("https://coder.example.com/callback")).toBe(true);
  });

  test("allows http for localhost", () => {
    expect(isAllowedRedirectUri("http://localhost:3000/callback")).toBe(true);
  });

  test("allows http for 127.0.0.1", () => {
    expect(isAllowedRedirectUri("http://127.0.0.1:8080/callback")).toBe(true);
  });

  test("allows http for IPv6 loopback", () => {
    expect(isAllowedRedirectUri("http://[::1]:8080/callback")).toBe(true);
  });

  test("rejects http for a non-loopback host", () => {
    expect(isAllowedRedirectUri("http://coder.example.com/callback")).toBe(false);
  });

  test("rejects http for a host that merely contains localhost", () => {
    expect(isAllowedRedirectUri("http://localhost.evil.com/callback")).toBe(false);
  });

  test("rejects non-http(s) schemes", () => {
    expect(isAllowedRedirectUri("ftp://localhost/callback")).toBe(false);
    // eslint-disable-next-line no-script-url
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
  });

  test("rejects malformed URIs", () => {
    expect(isAllowedRedirectUri("not a url")).toBe(false);
  });
});

describe("isRegisteredRedirectUri", () => {
  test("matches exact URI", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth/infisical/callback"],
        "https://coder.example.com/external-auth/infisical/callback"
      )
    ).toBe(true);
  });

  test("matches URL-normalized URI", () => {
    expect(isRegisteredRedirectUri(["https://coder.example.com"], "https://coder.example.com/")).toBe(true);
  });

  test("rejects unregistered URI", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth/infisical/callback"],
        "https://evil.example.com/callback"
      )
    ).toBe(false);
  });

  test("rejects URI with extra path segments", () => {
    expect(
      isRegisteredRedirectUri(
        ["https://coder.example.com/external-auth"],
        "https://coder.example.com/external-auth/other"
      )
    ).toBe(false);
  });
});

describe("assertValidOauthClientGrantConfig", () => {
  const redirectFlow = {
    grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken],
    resolved: { redirectUris: ["https://app.example.com/callback"] },
    supplied: { redirectUris: ["https://app.example.com/callback"], requirePkce: true }
  };

  const exchangeFlow = {
    grantTypes: [OauthGrantType.TokenExchange],
    resolved: { redirectUris: [], tokenExchangeAudience: "api://mcp" },
    supplied: { tokenExchangeAudience: "api://mcp", tokenExchangeIdpSatisfiesMfa: true }
  };

  test("accepts a redirect-flow application", () => {
    expect(() => assertValidOauthClientGrantConfig(redirectFlow)).not.toThrow();
  });

  test("accepts a token-exchange-only application", () => {
    expect(() => assertValidOauthClientGrantConfig(exchangeFlow)).not.toThrow();
  });

  test("accepts an application registered for both grants", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken, OauthGrantType.TokenExchange],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" }
      })
    ).not.toThrow();
  });

  test("rejects an empty grant type list", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({ grantTypes: [], resolved: { redirectUris: [] }, supplied: {} })
    ).toThrow(/At least one grant type/);
  });

  test("rejects refresh_token without authorization_code", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.RefreshToken],
        resolved: { redirectUris: ["https://app.example.com/callback"] },
        supplied: {}
      })
    ).toThrow(/requires the 'authorization_code' grant/);
  });

  test("rejects authorization_code with no redirect URI", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode],
        resolved: { redirectUris: [] },
        supplied: {}
      })
    ).toThrow(/At least one redirect URI is required/);
  });

  test("rejects redirect URIs supplied without a redirect-based grant", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.TokenExchange],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { redirectUris: ["https://app.example.com/callback"] }
      })
    ).toThrow(/Redirect URIs only apply/);
  });

  test("rejects requirePkce supplied without a redirect-based grant", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.TokenExchange],
        resolved: { redirectUris: [], tokenExchangeAudience: "api://mcp" },
        supplied: { requirePkce: true }
      })
    ).toThrow(/PKCE only applies/);
  });

  test("rejects the token exchange grant with no audience", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.TokenExchange],
        resolved: { redirectUris: [] },
        supplied: {}
      })
    ).toThrow(/token exchange audience is required/);
  });

  test("rejects a whitespace-only audience", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.TokenExchange],
        resolved: { redirectUris: [], tokenExchangeAudience: "   " },
        supplied: { tokenExchangeAudience: "   " }
      })
    ).toThrow(/token exchange audience is required/);
  });

  test("rejects an audience supplied without the token exchange grant", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { tokenExchangeAudience: "api://mcp" }
      })
    ).toThrow(/audience only applies/);
  });

  test("rejects the IdP MFA declaration without the token exchange grant", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode],
        resolved: { redirectUris: ["https://app.example.com/callback"] },
        supplied: { tokenExchangeIdpSatisfiesMfa: true }
      })
    ).toThrow(/MFA declaration only applies/);
  });

  // Dropping a grant must not force the caller to null out that grant's fields in the same request.
  test("allows dropping the token exchange grant while its stored audience is still set", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { grantTypes: [OauthGrantType.AuthorizationCode] } as never
      })
    ).not.toThrow();
  });
});
