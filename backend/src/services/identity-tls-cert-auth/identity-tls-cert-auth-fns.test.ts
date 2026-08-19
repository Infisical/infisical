import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { GeneralName, GeneralSubtree, NameConstraints } from "pkijs";
import { beforeAll, describe, expect, test } from "vitest";

import {
  isSubjectAltNameAllowed,
  isValidAllowedSubjectAltNameEntry,
  normalizeAllowedSubjectAltName,
  parseCertificateSubjectAltNames,
  parseSubjectDetails,
  permitsClientAuth,
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

describe("permitsClientAuth", () => {
  const alg: RsaHashedKeyGenParams = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048
  };

  x509.cryptoProvider.set(crypto.webcrypto as Crypto);

  const makeLeafWithUsages = async (usages?: string[]) => {
    const keys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "04",
      name: "CN=workload",
      notBefore: new Date("2026-06-01T00:00:00Z"),
      notAfter: new Date("2030-01-01T00:00:00Z"),
      keys,
      extensions: [
        new x509.BasicConstraintsExtension(false),
        ...(usages ? [new x509.ExtendedKeyUsageExtension(usages, true)] : [])
      ]
    });
    return new crypto.X509Certificate(Buffer.from(cert.rawData));
  };

  test("accepts a certificate that asserts no extended key usage", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages())).toBe(true);
  });

  test("accepts a certificate that asserts clientAuth", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages(["1.3.6.1.5.5.7.3.2"]))).toBe(true);
  });

  test("accepts a certificate that asserts clientAuth alongside other usages", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages(["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"]))).toBe(true);
  });

  test("accepts a certificate that asserts anyExtendedKeyUsage", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages(["2.5.29.37.0"]))).toBe(true);
  });

  test("rejects a serverAuth-only certificate", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages(["1.3.6.1.5.5.7.3.1"]))).toBe(false);
  });

  test("rejects a codeSigning-only certificate", async () => {
    expect(permitsClientAuth(await makeLeafWithUsages(["1.3.6.1.5.5.7.3.3"]))).toBe(false);
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

  const makeIntermediate = async (
    name: string,
    issuer: TIssued,
    opts?: { notAfter?: Date; serialNumber?: string; pathLength?: number; extraExtensions?: x509.Extension[] }
  ): Promise<TIssued> => {
    const keys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.create({
      serialNumber: opts?.serialNumber ?? "02",
      subject: `CN=${name}`,
      issuer: issuer.cert.subject,
      notBefore: NOT_BEFORE,
      notAfter: opts?.notAfter ?? FAR_FUTURE,
      signingKey: issuer.keys.privateKey,
      publicKey: keys.publicKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(true, opts?.pathLength, true), ...(opts?.extraExtensions ?? [])]
    });
    return { cert, keys };
  };

  const permittedDnsConstraint = (permitted: string[]) =>
    new x509.Extension(
      "2.5.29.30",
      true,
      new NameConstraints({
        permittedSubtrees: permitted.map(
          (dns) => new GeneralSubtree({ base: new GeneralName({ type: 2, value: dns }) })
        )
      })
        .toSchema()
        .toBER(false)
    );

  const clientAuthEku = (usages: string[]) => new x509.ExtendedKeyUsageExtension(usages, true);

  const permutationsOf = <T>(items: T[]): T[][] =>
    items.length <= 1
      ? [items]
      : items.flatMap((item, idx) =>
          permutationsOf([...items.slice(0, idx), ...items.slice(idx + 1)]).map((rest) => [item, ...rest])
        );

  // A cross-signed CA: the same subject and key certified by more than one parent, so the leaf
  // below it verifies against every copy and each copy opens a different path to the anchor.
  const makeCrossSigned = async (
    name: string,
    keys: CryptoKeyPair,
    issuer: TIssued,
    serialNumber: string,
    extraExtensions: x509.Extension[] = []
  ) =>
    x509.X509CertificateGenerator.create({
      serialNumber,
      subject: `CN=${name}`,
      issuer: issuer.cert.subject,
      notBefore: NOT_BEFORE,
      notAfter: FAR_FUTURE,
      signingKey: issuer.keys.privateKey,
      publicKey: keys.publicKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true), ...extraExtensions]
    });

  const makeLeaf = async (
    name: string,
    issuer: TIssued,
    opts?: { notBefore?: Date; notAfter?: Date; dnsName?: string }
  ) => {
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
      extensions: [
        new x509.BasicConstraintsExtension(false),
        ...(opts?.dnsName ? [new x509.SubjectAlternativeNameExtension([{ type: "dns", value: opts.dnsName }])] : [])
      ]
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
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("accepts a leaf issued directly by the configured anchor (single intermediate as anchor)", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(intermediate.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("rejects when the intermediate is missing (cannot reach the anchor)", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "ca_verification_failed" });
  });

  test("rejects a chain that does not lead to the configured anchor", async () => {
    const leaf = await makeLeaf("workload", intermediate);
    const result = await verifyClientCertificateChain({
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
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(forged.cert), toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("does not re-explore shared dead-end issuer paths", async () => {
    // Every maze certificate carries and is signed by one shared key, so any certificate at a level
    // verifies against any certificate at the level above it. That is what creates the
    // combinatorial path explosion the walk cache exists to bound.
    const mazeKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const anchorKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);

    let serial = 0x100;
    const mazeCert = async (subject: string, issuer: string, signingKey: CryptoKey, publicKey: CryptoKey) => {
      serial += 1;
      return x509.X509CertificateGenerator.create({
        serialNumber: serial.toString(16),
        subject,
        issuer,
        notBefore: NOT_BEFORE,
        notAfter: FAR_FUTURE,
        signingKey,
        publicKey,
        signingAlgorithm: alg,
        extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
      });
    };

    let verificationCount = 0;
    const counted = (cert: x509.X509Certificate) => {
      const native = toNative(cert);
      return {
        raw: native.raw,
        subject: native.subject,
        issuer: native.issuer,
        ca: native.ca,
        validFrom: native.validFrom,
        validTo: native.validTo,
        publicKey: native.publicKey,
        verify: (key: Parameters<typeof native.verify>[0]) => {
          verificationCount += 1;
          return native.verify(key);
        }
      } as unknown as InstanceType<typeof crypto.X509Certificate>;
    };

    const width = 4;
    const levels = 4;
    const deadEnds = await Promise.all(
      Array.from({ length: levels }, (__, level) =>
        Promise.all(
          Array.from({ length: width }, () =>
            mazeCert(`CN=level-${level}`, `CN=level-${level + 1}`, mazeKeys.privateKey, mazeKeys.publicKey)
          )
        )
      )
    );

    const anchor = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "0f",
      name: "CN=anchor",
      notBefore: NOT_BEFORE,
      notAfter: FAR_FUTURE,
      keys: anchorKeys,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
    // Shares the maze public key, so the leaf verifies against it as well as against every dead end.
    const successfulIssuer = await mazeCert("CN=level-0", "CN=anchor", anchorKeys.privateKey, mazeKeys.publicKey);

    const leafKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const leaf = await x509.X509CertificateGenerator.create({
      serialNumber: "0e",
      subject: "CN=leaf",
      issuer: "CN=level-0",
      notBefore: NOT_BEFORE,
      notAfter: FAR_FUTURE,
      signingKey: mazeKeys.privateKey,
      publicKey: leafKeys.publicKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(false)]
    });

    const result = await verifyClientCertificateChain({
      leaf: counted(leaf),
      presentedChain: [...deadEnds.flat(), successfulIssuer].map(counted),
      trustAnchor: counted(anchor),
      now: NOW
    });

    expect(result).toEqual({ ok: true });
    expect(verificationCount).toBeLessThan(150);
  });

  test("rejects an expired leaf", async () => {
    const leaf = await makeLeaf("workload", intermediate, {
      notBefore: NOT_BEFORE,
      notAfter: new Date("2026-06-10T00:00:00Z")
    });
    const result = await verifyClientCertificateChain({
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
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(intermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "certificate_not_yet_valid" });
  });

  test("rejects a leaf signed directly by a non-CA configured anchor", async () => {
    // A configured certificate that is not marked CA:TRUE must not anchor a path even when it
    // cryptographically signed the leaf. Otherwise chain mode would authenticate against a non-CA
    // issuer despite being documented as trust-anchor (CA) validation.
    const nonCaAnchorKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const nonCaAnchor = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "0a",
      name: "CN=Non-CA Anchor",
      notBefore: NOT_BEFORE,
      notAfter: FAR_FUTURE,
      keys: nonCaAnchorKeys,
      extensions: [new x509.BasicConstraintsExtension(false)]
    });
    const leaf = await makeLeaf("workload", { cert: nonCaAnchor, keys: nonCaAnchorKeys });
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(nonCaAnchor),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "ca_verification_failed" });
  });

  test("rejects a leaf minted outside the permitted namespace of its issuing CA", async () => {
    // The delegated sub-CA is constrained to team-a, but mints a leaf naming a workload it was
    // never authorised to certify. Without name constraint enforcement the holder of any
    // constrained sub-CA under the pinned anchor could impersonate any identity on that anchor.
    const constrained = await makeIntermediate("Constrained Intermediate CA", root, {
      serialNumber: "20",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });
    const leaf = await makeLeaf("victim.example.com", constrained, { dnsName: "victim.example.com" });

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(constrained.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "name_constraint_violation" });
  });

  test("accepts a leaf inside the permitted namespace of its issuing CA", async () => {
    const constrained = await makeIntermediate("Constrained Intermediate CA", root, {
      serialNumber: "21",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });
    const leaf = await makeLeaf("team-a.example.com", constrained, { dnsName: "team-a.example.com" });

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(constrained.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("enforces name constraints carried by the configured anchor itself", async () => {
    const constrained = await makeIntermediate("Constrained Anchor CA", root, {
      serialNumber: "22",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });
    const leaf = await makeLeaf("victim.example.com", constrained, { dnsName: "victim.example.com" });

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(constrained.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "name_constraint_violation" });
  });

  test("rejects a chain deeper than a CA's pathLenConstraint permits", async () => {
    const limited = await makeIntermediate("PathLen Zero CA", root, { serialNumber: "30", pathLength: 0 });
    const extra = await makeIntermediate("Extra Intermediate CA", limited, { serialNumber: "31" });
    const leaf = await makeLeaf("workload", extra);

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(limited.cert), toNative(extra.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "path_length_exceeded" });
  });

  test("accepts a leaf issued directly by a pathLen:0 CA", async () => {
    const limited = await makeIntermediate("PathLen Zero CA", root, { serialNumber: "32", pathLength: 0 });
    const leaf = await makeLeaf("workload", limited);

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(limited.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("rejects a clientAuth leaf issued through a serverAuth-only intermediate", async () => {
    // A CA's EKU restricts the purposes of everything beneath it, so a serverAuth-only intermediate
    // cannot delegate client authentication no matter what the leaf itself asserts.
    const serverOnly = await makeIntermediate("ServerAuth Only CA", root, {
      serialNumber: "40",
      extraExtensions: [clientAuthEku(["1.3.6.1.5.5.7.3.1"])]
    });
    const leaf = await makeLeaf("workload", serverOnly);

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(serverOnly.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "issuer_client_auth_usage_not_allowed" });
  });

  test("rejects a leaf issued directly by a codeSigning-only configured anchor", async () => {
    const codeSigningOnly = await makeIntermediate("CodeSigning Only CA", root, {
      serialNumber: "41",
      extraExtensions: [clientAuthEku(["1.3.6.1.5.5.7.3.3"])]
    });
    const leaf = await makeLeaf("workload", codeSigningOnly);

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [],
      trustAnchor: toNative(codeSigningOnly.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "issuer_client_auth_usage_not_allowed" });
  });

  test("accepts a chain whose CAs assert clientAuth or anyExtendedKeyUsage", async () => {
    const clientAuthCa = await makeIntermediate("ClientAuth CA", root, {
      serialNumber: "42",
      extraExtensions: [clientAuthEku(["1.3.6.1.5.5.7.3.1", "1.3.6.1.5.5.7.3.2"])]
    });
    const anyPurposeCa = await makeIntermediate("Any Purpose CA", clientAuthCa, {
      serialNumber: "43",
      extraExtensions: [clientAuthEku(["2.5.29.37.0"])]
    });
    const leaf = await makeLeaf("workload", anyPurposeCa);

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(clientAuthCa.cert), toNative(anyPurposeCa.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("builds a path through an alternative issuer when one candidate forbids client auth", async () => {
    // Two CAs share a subject and key, so both verify as the leaf's issuer; only one permits
    // client authentication. The EKU check must not strand the chain on the wrong candidate.
    const usableKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const serverOnly = await makeCrossSigned("Shared Subject CA", usableKeys, root, "50", [
      clientAuthEku(["1.3.6.1.5.5.7.3.1"])
    ]);
    const clientCapable = await makeCrossSigned("Shared Subject CA", usableKeys, root, "51", [
      clientAuthEku(["1.3.6.1.5.5.7.3.2"])
    ]);
    const leaf = await makeLeaf("workload", { cert: clientCapable, keys: usableKeys });

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(serverOnly), toNative(clientCapable)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("continues past a path-length violation to a valid cross-signed path", async () => {
    // The issuing CA is cross-signed: one copy sits under a pathLen:0 CA (which may not have a CA
    // below it), the other under an unconstrained CA. Both paths are the same length and the
    // violating one is presented first, so committing to the first path found would deny a client
    // that has a perfectly good path available.
    const constrainedSub = await makeIntermediate("PathLen Zero Sub CA", root, {
      serialNumber: "60",
      pathLength: 0
    });
    const openSub = await makeIntermediate("Unconstrained Sub CA", root, { serialNumber: "61" });

    const sharedKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const viaConstrained = await makeCrossSigned("Shared Issuing CA", sharedKeys, constrainedSub, "62");
    const viaOpen = await makeCrossSigned("Shared Issuing CA", sharedKeys, openSub, "63");
    const leaf = await makeLeaf("workload", { cert: viaOpen, keys: sharedKeys });

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [constrainedSub, openSub]
        .map((i) => toNative(i.cert))
        .concat([viaConstrained, viaOpen].map(toNative)),
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("continues past a name constraint violation to a valid cross-signed path", async () => {
    const constrainedSub = await makeIntermediate("Namespace Constrained Sub CA", root, {
      serialNumber: "64",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });
    const openSub = await makeIntermediate("Unconstrained Sub CA", root, { serialNumber: "65" });

    const sharedKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const viaConstrained = await makeCrossSigned("Shared Issuing CA", sharedKeys, constrainedSub, "66");
    const viaOpen = await makeCrossSigned("Shared Issuing CA", sharedKeys, openSub, "67");
    const leaf = await makeLeaf(
      "victim.example.com",
      { cert: viaOpen, keys: sharedKeys },
      {
        dnsName: "victim.example.com"
      }
    );

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [constrainedSub, openSub]
        .map((i) => toNative(i.cert))
        .concat([viaConstrained, viaOpen].map(toNative)),
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: true });
  });

  test("accepts a cross-signed chain under every presentation order of the intermediates", async () => {
    // The presented chain is documented as order-independent, and with cross-signing the order
    // decides which path the search reaches first. Every ordering must reach the same verdict,
    // not just the one where the valid path happens to come first.
    const constrainedSub = await makeIntermediate("PathLen Zero Sub CA", root, {
      serialNumber: "70",
      pathLength: 0
    });
    const namespaceSub = await makeIntermediate("Namespace Constrained Sub CA", root, {
      serialNumber: "71",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });
    const openSub = await makeIntermediate("Unconstrained Sub CA", root, { serialNumber: "72" });

    const sharedKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const crossSigned = await Promise.all([
      makeCrossSigned("Shared Issuing CA", sharedKeys, constrainedSub, "73"),
      makeCrossSigned("Shared Issuing CA", sharedKeys, namespaceSub, "74"),
      makeCrossSigned("Shared Issuing CA", sharedKeys, openSub, "75")
    ]);
    const leaf = await makeLeaf(
      "victim.example.com",
      { cert: crossSigned[2], keys: sharedKeys },
      {
        dnsName: "victim.example.com"
      }
    );

    const presented = [constrainedSub.cert, namespaceSub.cert, openSub.cert, ...crossSigned];
    const orderings = permutationsOf(presented);

    const results = await Promise.all(
      orderings.map((ordering) =>
        verifyClientCertificateChain({
          leaf: toNative(leaf.cert),
          presentedChain: ordering.map(toNative),
          trustAnchor: toNative(root.cert),
          now: NOW
        })
      )
    );

    expect(orderings).toHaveLength(720);
    expect(results.filter((result) => !result.ok)).toEqual([]);
  });

  test("reports the constraint violation when every cross-signed path violates one", async () => {
    const constrainedSub = await makeIntermediate("PathLen Zero Sub CA", root, {
      serialNumber: "68",
      pathLength: 0
    });
    const namespaceSub = await makeIntermediate("Namespace Constrained Sub CA", root, {
      serialNumber: "69",
      extraExtensions: [permittedDnsConstraint(["team-a.example.com"])]
    });

    const sharedKeys = await crypto.webcrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const viaPathLen = await makeCrossSigned("Shared Issuing CA", sharedKeys, constrainedSub, "6a");
    const viaNamespace = await makeCrossSigned("Shared Issuing CA", sharedKeys, namespaceSub, "6b");
    const leaf = await makeLeaf(
      "victim.example.com",
      { cert: viaPathLen, keys: sharedKeys },
      {
        dnsName: "victim.example.com"
      }
    );

    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [constrainedSub, namespaceSub]
        .map((i) => toNative(i.cert))
        .concat([viaPathLen, viaNamespace].map(toNative)),
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "path_length_exceeded" });
  });

  test("rejects when the intermediate has expired", async () => {
    const expiredIntermediate = await makeIntermediate("Expired Intermediate", root, {
      notAfter: new Date("2026-06-10T00:00:00Z")
    });
    const leaf = await makeLeaf("workload", expiredIntermediate);
    const result = await verifyClientCertificateChain({
      leaf: toNative(leaf.cert),
      presentedChain: [toNative(expiredIntermediate.cert)],
      trustAnchor: toNative(root.cert),
      now: NOW
    });
    expect(result).toEqual({ ok: false, reasonCode: "certificate_expired" });
  });
});
