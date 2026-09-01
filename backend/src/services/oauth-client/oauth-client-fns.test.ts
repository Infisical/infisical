import crypto from "node:crypto";

import {
  assertValidOauthClientGrantConfig,
  computePkceChallenge,
  hasClientAuthorityChanged,
  hasWithdrawnTokenExchangeTrust,
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

describe("hasClientAuthorityChanged", () => {
  const authenticated = {
    clientSecretHash: "$2b$10$oldhasholdhasholdhashol",
    grantTypes: [OauthGrantType.TokenExchange],
    tokenExchangeAudience: "https://coder.example.com",
    tokenExchangeIdpSatisfiesMfa: true
  };

  test("reports no change when the client is untouched", () => {
    expect(hasClientAuthorityChanged(authenticated, { ...authenticated }, OauthGrantType.TokenExchange)).toBe(false);
  });

  test("reports a change when the client secret was rotated", () => {
    expect(
      hasClientAuthorityChanged(
        authenticated,
        { ...authenticated, clientSecretHash: "$2b$10$newhashnewhashnewhashne" },
        OauthGrantType.TokenExchange
      )
    ).toBe(true);
  });

  test("reports a change when the grant was withdrawn", () => {
    expect(
      hasClientAuthorityChanged(
        authenticated,
        { ...authenticated, grantTypes: [OauthGrantType.AuthorizationCode] },
        OauthGrantType.TokenExchange
      )
    ).toBe(true);
  });

  test("reports a change when the client was deleted", () => {
    expect(hasClientAuthorityChanged(authenticated, undefined, OauthGrantType.TokenExchange)).toBe(true);
  });

  test("reports no change when an unrelated grant was added", () => {
    expect(
      hasClientAuthorityChanged(
        authenticated,
        { ...authenticated, grantTypes: [OauthGrantType.TokenExchange, OauthGrantType.AuthorizationCode] },
        OauthGrantType.TokenExchange
      )
    ).toBe(false);
  });

  test("reports a change when the token exchange audience was narrowed", () => {
    expect(
      hasClientAuthorityChanged(
        authenticated,
        { ...authenticated, tokenExchangeAudience: "https://other.example.com" },
        OauthGrantType.TokenExchange
      )
    ).toBe(true);
  });

  test("reports a change when the IdP MFA declaration was withdrawn", () => {
    expect(
      hasClientAuthorityChanged(
        authenticated,
        { ...authenticated, tokenExchangeIdpSatisfiesMfa: false },
        OauthGrantType.TokenExchange
      )
    ).toBe(true);
  });

  test("ignores the token exchange fields for other grants", () => {
    const redirectClient = { ...authenticated, grantTypes: [OauthGrantType.AuthorizationCode] };
    expect(
      hasClientAuthorityChanged(
        redirectClient,
        { ...redirectClient, tokenExchangeAudience: null, tokenExchangeIdpSatisfiesMfa: false },
        OauthGrantType.AuthorizationCode
      )
    ).toBe(false);
  });
});

describe("hasWithdrawnTokenExchangeTrust", () => {
  const enabled = { isEnabled: true, audience: "api://mcp", idpSatisfiesMfa: true };

  test("reports nothing withdrawn when the configuration is unchanged", () => {
    expect(hasWithdrawnTokenExchangeTrust(enabled, { ...enabled })).toBe(false);
  });

  test("reports a withdrawal when the token exchange grant is removed", () => {
    expect(hasWithdrawnTokenExchangeTrust(enabled, { isEnabled: false, audience: null, idpSatisfiesMfa: false })).toBe(
      true
    );
  });

  // Tokens already issued were accepted against the old audience, which no longer describes what this
  // application is allowed to exchange.
  test("reports a withdrawal when the audience is narrowed", () => {
    expect(hasWithdrawnTokenExchangeTrust(enabled, { ...enabled, audience: "api://mcp-prod" })).toBe(true);
  });

  test("reports a withdrawal when the audience is cleared", () => {
    expect(hasWithdrawnTokenExchangeTrust(enabled, { ...enabled, audience: null })).toBe(true);
  });

  // The declaration is what let an MFA-required user be exchanged at all, so their live tokens go with it.
  test("reports a withdrawal when the identity provider MFA declaration is turned off", () => {
    expect(hasWithdrawnTokenExchangeTrust(enabled, { ...enabled, idpSatisfiesMfa: false })).toBe(true);
  });

  // Widening: nothing already issued was granted on a basis that stopped holding.
  test("reports nothing withdrawn when the identity provider MFA declaration is turned on", () => {
    const previous = { ...enabled, idpSatisfiesMfa: false };

    expect(hasWithdrawnTokenExchangeTrust(previous, { ...previous, idpSatisfiesMfa: true })).toBe(false);
  });

  test("reports nothing withdrawn when the application never held the grant", () => {
    const previous = { isEnabled: false, audience: null, idpSatisfiesMfa: false };

    expect(hasWithdrawnTokenExchangeTrust(previous, enabled)).toBe(false);
  });

  // A redirect-flow application carries no audience at all, and updating it must not sign its users out.
  test("treats an absent audience and a null audience as the same value", () => {
    const previous = { isEnabled: true, audience: null, idpSatisfiesMfa: false };

    expect(hasWithdrawnTokenExchangeTrust(previous, { isEnabled: true, idpSatisfiesMfa: false })).toBe(false);
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

  test("rejects an application registered for both flows", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.RefreshToken, OauthGrantType.TokenExchange],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" }
      })
    ).toThrow(/cannot be combined with the 'authorization_code' grant/);
  });

  test("rejects the token exchange grant alongside authorization_code alone", () => {
    expect(() =>
      assertValidOauthClientGrantConfig({
        grantTypes: [OauthGrantType.AuthorizationCode, OauthGrantType.TokenExchange],
        resolved: { redirectUris: ["https://app.example.com/callback"], tokenExchangeAudience: "api://mcp" },
        supplied: { tokenExchangeAudience: "api://mcp" }
      })
    ).toThrow(/cannot be combined with the 'authorization_code' grant/);
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
