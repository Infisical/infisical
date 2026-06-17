import { describe, expect, test } from "vitest";

import {
  isSubjectAltNameAllowed,
  normalizeAllowedSubjectAltName,
  parseCertificateSubjectAltNames,
  parseSubjectDetails
} from "./identity-tls-cert-auth-fns";

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

  test("preserves values that contain an equals sign", () => {
    expect(parseSubjectDetails("CN=a=b=c")).toEqual({ CN: "a=b=c" });
  });

  test("returns empty object for empty string", () => {
    expect(parseSubjectDetails("")).toEqual({});
  });

  test("skips lines missing an equals sign", () => {
    expect(parseSubjectDetails("CN=svc\nmalformed")).toEqual({ CN: "svc" });
  });
});

describe("parseCertificateSubjectAltNames", () => {
  test("returns empty array for undefined input", () => {
    expect(parseCertificateSubjectAltNames(undefined)).toEqual([]);
  });

  test("returns empty array for empty string", () => {
    expect(parseCertificateSubjectAltNames("")).toEqual([]);
  });

  test("emits a canonical type:value token for a URI SAN", () => {
    expect(parseCertificateSubjectAltNames("URI:spiffe://example.org/svc")).toEqual([
      "uri:spiffe://example.org/svc"
    ]);
  });

  test("lower-cases DNS SAN values (case-insensitive per RFC 5280)", () => {
    expect(parseCertificateSubjectAltNames("DNS:SVC.EXAMPLE.COM")).toEqual(["dns:svc.example.com"]);
  });

  test("normalizes the IP Address type token", () => {
    expect(parseCertificateSubjectAltNames("IP Address:10.0.0.1")).toEqual(["ip:10.0.0.1"]);
  });

  test("does not lower-case URI SAN values", () => {
    expect(parseCertificateSubjectAltNames("URI:spiffe://example.org/MyService")).toEqual([
      "uri:spiffe://example.org/MyService"
    ]);
  });

  test("handles multiple comma-separated SANs", () => {
    expect(
      parseCertificateSubjectAltNames("DNS:svc.example.com, URI:spiffe://example.org/svc, IP Address:10.0.0.1")
    ).toEqual(["dns:svc.example.com", "uri:spiffe://example.org/svc", "ip:10.0.0.1"]);
  });

  test("skips entries without a type prefix to avoid cross-type matches", () => {
    expect(parseCertificateSubjectAltNames("bare-value")).toEqual([]);
  });
});

describe("normalizeAllowedSubjectAltName", () => {
  test("returns null for an empty entry", () => {
    expect(normalizeAllowedSubjectAltName("")).toBeNull();
    expect(normalizeAllowedSubjectAltName("   ")).toBeNull();
  });

  test("defaults a bare value to a DNS SAN", () => {
    expect(normalizeAllowedSubjectAltName("svc.example.com")).toEqual("dns:svc.example.com");
  });

  test("lower-cases a bare DNS value", () => {
    expect(normalizeAllowedSubjectAltName("SVC.Example.COM")).toEqual("dns:svc.example.com");
  });

  test("keeps a type-prefixed URI entry", () => {
    expect(normalizeAllowedSubjectAltName("URI:spiffe://example.org/svc")).toEqual("uri:spiffe://example.org/svc");
  });
});

describe("isSubjectAltNameAllowed", () => {
  test("matches a type-prefixed allow-list entry against the certificate", () => {
    expect(isSubjectAltNameAllowed("URI:spiffe://example.org/svc", "URI:spiffe://example.org/svc")).toBe(true);
  });

  test("matches a bare DNS allow-list entry against a DNS SAN", () => {
    expect(isSubjectAltNameAllowed("svc.example.com", "DNS:svc.example.com")).toBe(true);
  });

  test("matches DNS SANs case-insensitively", () => {
    expect(isSubjectAltNameAllowed("svc.example.com", "DNS:SVC.EXAMPLE.COM")).toBe(true);
  });

  test("does not conflate SAN types (bare URI value must not match a DNS SAN)", () => {
    // A bare entry defaults to DNS, so it must NOT be satisfied by a URI SAN of the same string.
    expect(isSubjectAltNameAllowed("spiffe://example.org/svc", "URI:spiffe://example.org/svc")).toBe(false);
  });

  test("does not match a fabricated cross-type SAN", () => {
    // Allow-list wants a URI SAN; a (structurally absurd) DNS SAN with the same string must not pass.
    expect(isSubjectAltNameAllowed("URI:spiffe://example.org/svc", "DNS:spiffe://example.org/svc")).toBe(false);
  });

  test("matches when any one of several allow-list entries is satisfied", () => {
    expect(
      isSubjectAltNameAllowed("URI:spiffe://example.org/other, svc.example.com", "DNS:svc.example.com")
    ).toBe(true);
  });

  test("returns false when no certificate SAN matches", () => {
    expect(isSubjectAltNameAllowed("URI:spiffe://example.org/svc", "URI:spiffe://example.org/other")).toBe(false);
  });

  test("returns false when the certificate has no SANs", () => {
    expect(isSubjectAltNameAllowed("svc.example.com", undefined)).toBe(false);
  });

  test("tolerates whitespace in the allow-list", () => {
    expect(isSubjectAltNameAllowed(" svc.example.com , URI:spiffe://example.org/svc ", "DNS:svc.example.com")).toBe(
      true
    );
  });
});
