import { describe, expect, it, vi } from "vitest";

import { TEMPLATE_VALIDATION_MESSAGES } from "./identity-auth-template-enums";
import { oidcTemplateFieldsSchema, templateFieldsPatchSchema } from "./identity-auth-template-schemas";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ isDevelopmentMode: false, ALLOW_INTERNAL_IP_CONNECTIONS: false })
}));

const parseDiscoveryUrl = (oidcDiscoveryUrl: string) =>
  oidcTemplateFieldsSchema.safeParse({
    oidcDiscoveryUrl,
    boundIssuer: "https://issuer.example.com",
    boundAudiences: "https://github.com/acme"
  });

// the login flow builds the document URL by concatenation, so whatever a template stores
// has to survive having "/.well-known/openid-configuration" appended to it
describe("oidcTemplateFieldsSchema discovery URL", () => {
  it("strips trailing slashes so the appended suffix cannot double up the separator", () => {
    const result = parseDiscoveryUrl("https://idp.example.com/realms/acme//");

    expect(result.success).toBe(true);
    expect(result.success && result.data.oidcDiscoveryUrl).toBe("https://idp.example.com/realms/acme");
  });

  it.each([
    ["https://idp.example.com/.well-known/openid-configuration"],
    ["https://idp.example.com/.well-known/openid-configuration/"]
  ])("rejects an already-suffixed URL: %s", (url) => {
    const result = parseDiscoveryUrl(url);

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0].message).toContain("Infisical appends it automatically");
  });

  it.each([["https://idp.example.com?tenant=acme"], ["https://idp.example.com#acme"]])(
    "rejects a URL whose suffix would land inside a query or fragment: %s",
    (url) => {
      const result = parseDiscoveryUrl(url);

      expect(result.success).toBe(false);
      expect(result.success === false && result.error.issues[0].message).toContain("query string or fragment");
    }
  );

  it("accepts a plain issuer base unchanged", () => {
    const result = parseDiscoveryUrl("https://idp.example.com/realms/acme");

    expect(result.success).toBe(true);
    expect(result.success && result.data.oidcDiscoveryUrl).toBe("https://idp.example.com/realms/acme");
  });
});

// the route cannot see the template's method, so the error must name the offending field
describe("templateFieldsPatchSchema", () => {
  it("surfaces the OIDC discovery URL error for an OIDC-only patch", () => {
    const result = templateFieldsPatchSchema.safeParse({
      oidcDiscoveryUrl: "https://idp.example.com/.well-known/openid-configuration"
    });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues).toEqual([
      expect.objectContaining({
        path: ["oidcDiscoveryUrl"],
        message: TEMPLATE_VALIDATION_MESSAGES.OIDC.DISCOVERY_URL_WELL_KNOWN_SUFFIX
      })
    ]);
  });

  it("names the field for a bad Kubernetes value instead of calling the key unrecognized", () => {
    const result = templateFieldsPatchSchema.safeParse({ tokenReviewMode: "bogus" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues).toEqual([
      expect.objectContaining({ code: "invalid_enum_value", path: ["tokenReviewMode"] })
    ]);
  });

  it("rejects a key that belongs to no auth method", () => {
    const result = templateFieldsPatchSchema.safeParse({ bindDn: "cn=admin,dc=example,dc=com" });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["bindDn"] })
    ]);
  });

  it("applies the field normalizations to a partial patch", () => {
    const result = templateFieldsPatchSchema.safeParse({ oidcDiscoveryUrl: "https://idp.example.com/realms/acme/" });

    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ oidcDiscoveryUrl: "https://idp.example.com/realms/acme" });
  });

  it("leaves method membership to the service", () => {
    const result = templateFieldsPatchSchema.safeParse({
      url: "ldap://idp.example.com",
      oidcDiscoveryUrl: "https://idp.example.com"
    });

    expect(result.success).toBe(true);
  });
});
