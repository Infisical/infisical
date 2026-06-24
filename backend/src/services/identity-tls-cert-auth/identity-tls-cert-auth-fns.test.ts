import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, test } from "vitest";

import {
  isSubjectAltNameAllowed,
  isValidAllowedSubjectAltNameEntry,
  normalizeAllowedSubjectAltName,
  parseCertificateSubjectAltNames,
  parseSubjectDetails,
  TCertificateSanItem,
  verifyClientCertificateChain
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

describe("verifyClientCertificateChain", () => {
  const alg: RsaHashedKeyGenParams = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048
  };

  x509.cryptoProvider.set(crypto.webcrypto as Crypto);

  type TIssued = { cert: x509.X509Certificate; keys: CryptoKeyPair };

  const NOW = new Date("2026-06-24T12:00:00Z");
  const NOT_BEFORE = new Date("2026-06-01T00:00:00Z");
  const FAR_FUTURE = new Date("2030-01-01T00:00:00Z");

  const toNative = (cert: x509.X509Certificate) => new crypto.X509Certificate(Buffer.from(cert.rawData));

  const makeRoot = async (name: string): Promise<TIssued> => {
    const keys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name: `CN=${name}`,
      notBefore: NOT_BEFORE,
      notAfter: FAR_FUTURE,
      keys,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
    return { cert, keys };
  };

  const makeIntermediate = async (name: string, issuer: TIssued, opts?: { notAfter?: Date }): Promise<TIssued> => {
    const keys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: "02",
      subject: `CN=${name}`,
      issuer: issuer.cert.subject,
      notBefore: NOT_BEFORE,
      notAfter: opts?.notAfter ?? FAR_FUTURE,
      signingKey: issuer.keys.privateKey,
      publicKey: keys.publicKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
    return { cert, keys };
  };

  const makeLeaf = async (name: string, issuer: TIssued, opts?: { notBefore?: Date; notAfter?: Date }) => {
    const keys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: "03",
      subject: `CN=${name}`,
      issuer: issuer.cert.subject,
      notBefore: opts?.notBefore ?? NOT_BEFORE,
      notAfter: opts?.notAfter ?? FAR_FUTURE,
      signingKey: issuer.keys.privateKey,
      publicKey: keys.publicKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(false)]
    });
    return { cert, keys };
  };

  let root: TIssued;
  let intermediate: TIssued;
  let otherRoot: TIssued;

  beforeAll(async () => {
    root = await makeRoot("Stable Root CA");
    intermediate = await makeIntermediate("Rotating Intermediate CA", root);
    otherRoot = await makeRoot("Unrelated Root CA");
  });

  test("accepts a leaf whose presented intermediate chains to the configured root", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("accepts a leaf issued directly by the configured anchor (single intermediate as anchor)", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(intermediate.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("rejects when the intermediate is missing (cannot reach the anchor)", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "ca_verification_failed" });
  });

  test("rejects a chain that does not lead to the configured anchor", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(otherRoot.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "ca_verification_failed" });
  });

  test("ignores an unrelated forged intermediate presented alongside the valid one", async () => {
    const forged = await makeIntermediate("Forged Intermediate", otherRoot);
    const leaf = await makeLeaf("workload", intermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(forged.cert), toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("rejects an expired leaf", async () => {
    const leaf = await makeLeaf("workload", intermediate, {
      notBefore: NOT_BEFORE,
      notAfter: new Date("2026-06-10T00:00:00Z")
    });
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "certificate_expired" });
  });

  test("rejects a not-yet-valid leaf", async () => {
    const leaf = await makeLeaf("workload", intermediate, {
      notBefore: new Date("2026-07-01T00:00:00Z"),
      notAfter: FAR_FUTURE
    });
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "certificate_not_yet_valid" });
  });

  test("rejects when the intermediate has expired", async () => {
    const expiredIntermediate = await makeIntermediate("Expired Intermediate", root, {
      notAfter: new Date("2026-06-10T00:00:00Z")
    });
    const leaf = await makeLeaf("workload", expiredIntermediate);
    const result = verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(expiredIntermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "certificate_expired" });
  });
});
