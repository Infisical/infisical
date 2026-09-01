import { describe, expect, it, vi } from "vitest";

import { oidcTemplateFieldsSchema } from "./identity-auth-template-schemas";

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
