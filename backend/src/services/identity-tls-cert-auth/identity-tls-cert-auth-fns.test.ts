import { describe, expect, test } from "vitest";

import { parseSubjectAltNames, parseSubjectDetails } from "./identity-tls-cert-auth-fns";

describe("parseSubjectDetails", () => {
  test("parses a single CN field", () => {
    expect(parseSubjectDetails("CN=my-service")).toEqual({ CN: "my-service" });
  });

  test("parses multiple newline-separated fields", () => {
    expect(parseSubjectDetails("CN=svc\nO=MyOrg\nC=US")).toEqual({ CN: "svc", O: "MyOrg", C: "US" });
  });

  test("trims whitespace around key and value", () => {
    expect(parseSubjectDetails("CN = svc\nO = MyOrg")).toEqual({ CN: "svc", O: "MyOrg" });
  });

  test("returns empty object for empty string", () => {
    expect(parseSubjectDetails("")).toEqual({});
  });

  test("skips lines missing an equals sign", () => {
    expect(parseSubjectDetails("CN=svc\nmalformed")).toEqual({ CN: "svc" });
  });
});

describe("parseSubjectAltNames", () => {
  test("returns empty array for undefined input", () => {
    expect(parseSubjectAltNames(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseSubjectAltNames("")).toEqual([]);
  });

  test("exposes both the raw value and the type-prefixed form for a URI SAN", () => {
    const result = parseSubjectAltNames("URI:spiffe://example.org/svc");
    expect(result).toContain("spiffe://example.org/svc");
    expect(result).toContain("URI:spiffe://example.org/svc");
  });

  test("exposes both forms for a DNS SAN", () => {
    const result = parseSubjectAltNames("DNS:svc.example.com");
    expect(result).toContain("svc.example.com");
    expect(result).toContain("DNS:svc.example.com");
  });

  test("exposes both forms for an IP SAN", () => {
    const result = parseSubjectAltNames("IP Address:10.0.0.1");
    expect(result).toContain("10.0.0.1");
    expect(result).toContain("IP Address:10.0.0.1");
  });

  test("handles multiple comma-separated SANs", () => {
    const result = parseSubjectAltNames("DNS:svc.example.com, URI:spiffe://example.org/svc, IP Address:10.0.0.1");
    expect(result).toContain("svc.example.com");
    expect(result).toContain("DNS:svc.example.com");
    expect(result).toContain("spiffe://example.org/svc");
    expect(result).toContain("URI:spiffe://example.org/svc");
    expect(result).toContain("10.0.0.1");
    expect(result).toContain("IP Address:10.0.0.1");
  });

  test("returns the entry as-is when there is no colon separator", () => {
    const result = parseSubjectAltNames("bare-value");
    expect(result).toEqual(["bare-value"]);
  });

  test("allows an allow-list entry to match using the raw value", () => {
    const certSans = parseSubjectAltNames("URI:spiffe://example.org/svc");
    const allowed = "spiffe://example.org/svc";
    expect(certSans).toContain(allowed);
  });

  test("allows an allow-list entry to match using the type-prefixed form", () => {
    const certSans = parseSubjectAltNames("URI:spiffe://example.org/svc");
    const allowed = "URI:spiffe://example.org/svc";
    expect(certSans).toContain(allowed);
  });

  test("does not match a different SAN value", () => {
    const certSans = parseSubjectAltNames("URI:spiffe://example.org/svc");
    expect(certSans).not.toContain("spiffe://example.org/other");
    expect(certSans).not.toContain("URI:spiffe://example.org/other");
  });
});
