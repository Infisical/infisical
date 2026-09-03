import { describe, expect, it } from "vitest";

import { buildCertificateQuotaKey } from "./certificate-quota-key";

const CN_ONLY = "ac8da107e6e4e13b34d491fb0eb4093d907a7f4cfad7772c1146a72c41791887";
const CN_PLUS_TWO_SANS = "fbdbe1005e3a5b5bc197281b552c0b66882f6c1ffbe797a193c4f0fb2b407042";

describe("buildCertificateQuotaKey", () => {
  // Pinned, so changing the canonicalization fails here rather than silently re-hashing the fleet.
  it("pins the hash for a known input", () => {
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: null })).toBe(CN_ONLY);
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com,b.example.com" })).toBe(
      CN_PLUS_TWO_SANS
    );
  });

  it("is stable across SAN ordering", () => {
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "b.example.com,a.example.com" })).toBe(
      CN_PLUS_TWO_SANS
    );
  });

  it("treats ', ' and ',' separators as equivalent", () => {
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com, b.example.com" })).toBe(
      CN_PLUS_TWO_SANS
    );
  });

  it("treats null, undefined and empty-string altNames as equivalent", () => {
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: null })).toBe(CN_ONLY);
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "" })).toBe(CN_ONLY);
    expect(buildCertificateQuotaKey({ commonName: "example.com" })).toBe(CN_ONLY);
  });

  it("is case insensitive", () => {
    expect(buildCertificateQuotaKey({ commonName: "EXAMPLE.com", altNames: "A.Example.COM,b.example.com" })).toBe(
      CN_PLUS_TWO_SANS
    );
  });

  it("ignores duplicate SANs", () => {
    expect(
      buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com,a.example.com,b.example.com" })
    ).toBe(CN_PLUS_TWO_SANS);
  });

  it("ignores surrounding whitespace and empty entries", () => {
    expect(
      buildCertificateQuotaKey({ commonName: "  example.com ", altNames: " a.example.com , b.example.com " })
    ).toBe(CN_PLUS_TWO_SANS);
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com,,b.example.com" })).toBe(
      CN_PLUS_TWO_SANS
    );
  });

  it("distinguishes certificates that are genuinely different", () => {
    const base = buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com" });

    expect(buildCertificateQuotaKey({ commonName: "other.com", altNames: "a.example.com" })).not.toBe(base);
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "b.example.com" })).not.toBe(base);
    expect(buildCertificateQuotaKey({ commonName: "example.com", altNames: "a.example.com,b.example.com" })).not.toBe(
      base
    );
    // A SAN moving into the common name is a different certificate, not the same one.
    expect(buildCertificateQuotaKey({ commonName: "a.example.com", altNames: "example.com" })).not.toBe(base);
  });
});
