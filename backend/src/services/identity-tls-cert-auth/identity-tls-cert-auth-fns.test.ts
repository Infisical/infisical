import { describe, expect, test } from "vitest";

import {
  isSubjectAltNameAllowed,
  isValidAllowedSubjectAltNameEntry,
  normalizeAllowedSubjectAltName,
  parseCertificateSubjectAltNames,
  parseSubjectDetails,
  TCertificateSanItem
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

  test("returns empty object for undefined/null (cert with empty Subject, e.g. SPIFFE SVID)", () => {
    expect(parseSubjectDetails(undefined)).toEqual({});
    expect(parseSubjectDetails(null)).toEqual({});
  });

  test("skips lines missing an equals sign", () => {
    expect(parseSubjectDetails("CN=svc\nmalformed")).toEqual({ CN: "svc" });
  });
});

describe("parseCertificateSubjectAltNames", () => {
  test("returns empty array for undefined input", () => {
    expect(parseCertificateSubjectAltNames(undefined)).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(parseCertificateSubjectAltNames([])).toEqual([]);
  });

  test("maps a URI SAN (peculiar 'url' type) to a canonical uri token", () => {
    expect(parseCertificateSubjectAltNames([{ type: "url", value: "spiffe://example.org/svc" }])).toEqual([
      "uri:spiffe://example.org/svc"
    ]);
  });

  test("lower-cases DNS SAN values (case-insensitive per RFC 5280)", () => {
    expect(parseCertificateSubjectAltNames([{ type: "dns", value: "SVC.EXAMPLE.COM" }])).toEqual([
      "dns:svc.example.com"
    ]);
  });

  test("preserves IP SAN values", () => {
    expect(parseCertificateSubjectAltNames([{ type: "ip", value: "10.0.0.1" }])).toEqual(["ip:10.0.0.1"]);
  });

  test("does not lower-case URI SAN values", () => {
    expect(parseCertificateSubjectAltNames([{ type: "url", value: "spiffe://example.org/MyService" }])).toEqual([
      "uri:spiffe://example.org/MyService"
    ]);
  });

  test("handles multiple SANs of mixed types", () => {
    const items: TCertificateSanItem[] = [
      { type: "dns", value: "svc.example.com" },
      { type: "url", value: "spiffe://example.org/svc" },
      { type: "ip", value: "10.0.0.1" }
    ];
    expect(parseCertificateSubjectAltNames(items)).toEqual([
      "dns:svc.example.com",
      "uri:spiffe://example.org/svc",
      "ip:10.0.0.1"
    ]);
  });

  test("skips unsupported SAN types (dn, guid, upn, registeredId)", () => {
    const items: TCertificateSanItem[] = [
      { type: "guid", value: "{00000000-0000-0000-0000-000000000000}" },
      { type: "dns", value: "svc.example.com" }
    ];
    expect(parseCertificateSubjectAltNames(items)).toEqual(["dns:svc.example.com"]);
  });

  test("preserves URI values containing commas (no naive string split)", () => {
    expect(parseCertificateSubjectAltNames([{ type: "url", value: "spiffe://example.org/a,b" }])).toEqual([
      "uri:spiffe://example.org/a,b"
    ]);
  });

  test("lower-cases only the domain part of an email SAN (RFC 5321 local-part is case-sensitive)", () => {
    expect(parseCertificateSubjectAltNames([{ type: "email", value: "Admin@Example.COM" }])).toEqual([
      "email:Admin@example.com"
    ]);
  });
});

describe("isValidAllowedSubjectAltNameEntry", () => {
  test("accepts a bare DNS name", () => {
    expect(isValidAllowedSubjectAltNameEntry("svc.example.com")).toBe(true);
  });

  test("accepts recognized type-prefixed entries", () => {
    expect(isValidAllowedSubjectAltNameEntry("URI:spiffe://example.org/svc")).toBe(true);
    expect(isValidAllowedSubjectAltNameEntry("IP:2001:db8::1")).toBe(true);
    expect(isValidAllowedSubjectAltNameEntry("EMAIL:svc@example.com")).toBe(true);
    expect(isValidAllowedSubjectAltNameEntry("URL:spiffe://example.org/svc")).toBe(true);
  });

  test("rejects a bare URI missing its type prefix", () => {
    expect(isValidAllowedSubjectAltNameEntry("spiffe://example.org/svc")).toBe(false);
  });

  test("rejects a bare IPv6 missing its type prefix", () => {
    expect(isValidAllowedSubjectAltNameEntry("2001:db8::1")).toBe(false);
  });

  test("rejects an empty entry", () => {
    expect(isValidAllowedSubjectAltNameEntry("   ")).toBe(false);
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

  test("accepts URL: as an alias for URI:", () => {
    expect(normalizeAllowedSubjectAltName("URL:spiffe://example.org/svc")).toEqual("uri:spiffe://example.org/svc");
  });

  test("normalizes an IP-prefixed entry", () => {
    expect(normalizeAllowedSubjectAltName("IP:10.0.0.1")).toEqual("ip:10.0.0.1");
  });

  test("treats an unrecognized prefix as part of a bare DNS value", () => {
    // A bare URI without a recognized prefix becomes a DNS entry that cannot match a URI SAN.
    expect(normalizeAllowedSubjectAltName("spiffe://example.org/svc")).toEqual("dns:spiffe://example.org/svc");
  });
});

describe("isSubjectAltNameAllowed", () => {
  test("matches a type-prefixed allow-list entry against the certificate", () => {
    expect(
      isSubjectAltNameAllowed(["URI:spiffe://example.org/svc"], [{ type: "url", value: "spiffe://example.org/svc" }])
    ).toBe(true);
  });

  test("matches a bare DNS allow-list entry against a DNS SAN", () => {
    expect(isSubjectAltNameAllowed(["svc.example.com"], [{ type: "dns", value: "svc.example.com" }])).toBe(true);
  });

  test("matches DNS SANs case-insensitively", () => {
    expect(isSubjectAltNameAllowed(["svc.example.com"], [{ type: "dns", value: "SVC.EXAMPLE.COM" }])).toBe(true);
  });

  test("matches email SAN domain case-insensitively but local-part case-sensitively", () => {
    // domain casing differs -> still matches
    expect(isSubjectAltNameAllowed(["EMAIL:svc@EXAMPLE.com"], [{ type: "email", value: "svc@example.com" }])).toBe(
      true
    );
    // local-part casing differs -> must NOT match
    expect(isSubjectAltNameAllowed(["EMAIL:Svc@example.com"], [{ type: "email", value: "svc@example.com" }])).toBe(
      false
    );
  });

  test("does not conflate SAN types (bare value defaults to DNS and must not match a URI SAN)", () => {
    expect(
      isSubjectAltNameAllowed(["spiffe://example.org/svc"], [{ type: "url", value: "spiffe://example.org/svc" }])
    ).toBe(false);
  });

  test("does not match a same-string SAN of a different type", () => {
    // Allow-list wants a URI SAN; a DNS SAN with the same string must not pass.
    expect(
      isSubjectAltNameAllowed(["URI:spiffe://example.org/svc"], [{ type: "dns", value: "spiffe://example.org/svc" }])
    ).toBe(false);
  });

  test("matches when any one of several allow-list entries is satisfied", () => {
    expect(
      isSubjectAltNameAllowed(
        ["URI:spiffe://example.org/other", "svc.example.com"],
        [{ type: "dns", value: "svc.example.com" }]
      )
    ).toBe(true);
  });

  test("returns false when no certificate SAN matches", () => {
    expect(
      isSubjectAltNameAllowed(["URI:spiffe://example.org/svc"], [{ type: "url", value: "spiffe://example.org/other" }])
    ).toBe(false);
  });

  test("returns false when the certificate has no SANs", () => {
    expect(isSubjectAltNameAllowed(["svc.example.com"], undefined)).toBe(false);
    expect(isSubjectAltNameAllowed(["svc.example.com"], [])).toBe(false);
  });

  test("returns false for an empty allow-list", () => {
    expect(isSubjectAltNameAllowed([], [{ type: "dns", value: "svc.example.com" }])).toBe(false);
  });

  test("trims surrounding whitespace on each allow-list entry", () => {
    expect(
      isSubjectAltNameAllowed(
        [" svc.example.com ", " URI:spiffe://example.org/svc "],
        [{ type: "dns", value: "svc.example.com" }]
      )
    ).toBe(true);
  });
});
