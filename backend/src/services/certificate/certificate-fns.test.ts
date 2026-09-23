import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { BadRequestError } from "@app/lib/errors";

import {
  buildCertificateBundle,
  CertificateThumbprintAlgorithm,
  extractCertificateFields,
  normalizeCaCertChain,
  normalizeThumbprint,
  parseCertificateBody,
  resolveCertificateDeletionEligibility
} from "./certificate-fns";
import { CertificateDeletionEligibility, CertStatus } from "./certificate-types";

describe("normalizeThumbprint", () => {
  const sha1Hex = "a".repeat(40);
  const sha256Hex = "b".repeat(64);

  test("detects SHA-1 thumbprints and formats with colons", () => {
    const { algorithm, fingerprint } = normalizeThumbprint(sha1Hex);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA1);
    expect(fingerprint).toBe(`${"AA:".repeat(19)}AA`);
  });

  test("detects SHA-256 thumbprints", () => {
    const { algorithm, fingerprint } = normalizeThumbprint(sha256Hex);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA256);
    expect(fingerprint.replace(/:/g, "")).toBe("B".repeat(64));
  });

  test("ignores colons, whitespace, and casing", () => {
    const colonDelimited = sha1Hex.toUpperCase().match(/.{2}/g)!.join(":");
    const messyInput = `  ${colonDelimited.toLowerCase()}  `;

    const { algorithm, fingerprint } = normalizeThumbprint(messyInput);
    expect(algorithm).toBe(CertificateThumbprintAlgorithm.SHA1);
    expect(fingerprint).toBe(colonDelimited);
  });

  test("throws on invalid digest length", () => {
    expect(() => normalizeThumbprint("abc123")).toThrow(BadRequestError);
  });
});

describe("buildCertificateBundle", () => {
  test("bundles cert + key when no chain is present", () => {
    expect(buildCertificateBundle("CERT", "KEY")).toBe("CERT\nKEY\n");
  });

  test("includes the chain between the leaf and the key when present", () => {
    expect(buildCertificateBundle("CERT", "KEY", "CHAIN")).toBe("CERT\nCHAIN\nKEY\n");
  });
});

describe("parseCertificateBody usages", () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);

  const buildCert = async (extensions: x509.Extension[], name = "CN=probe.example.com") => {
    const keys = await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048
      },
      true,
      ["sign", "verify"]
    );

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "01",
      name,
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2027-01-01"),
      keys: keys as CryptoKeyPair,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      extensions
    });

    return Buffer.from(cert.toString("pem"));
  };

  // Must stay in the legacy camelCase form the rest of the codebase reads and writes.
  test("reads key usages and extended key usages off the certificate in legacy form", async () => {
    const pem = await buildCert([
      new x509.BasicConstraintsExtension(true, 1, true),
      new x509.KeyUsagesExtension(
        // eslint-disable-next-line no-bitwise
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true
      ),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"], false)
    ]);

    const parsed = parseCertificateBody(pem);

    expect(parsed.keyUsages).toEqual(["digitalSignature", "keyCertSign", "cRLSign"]);
    expect(parsed.extendedKeyUsages).toEqual(["serverAuth"]);
    expect(parsed.basicConstraints).toEqual({ isCA: true, pathLength: 1 });
  });

  test("omits the usage fields when the certificate carries no usage extensions", async () => {
    const pem = await buildCert([new x509.BasicConstraintsExtension(false)]);

    const fields = extractCertificateFields(pem);

    expect(fields).not.toHaveProperty("keyUsages");
    expect(fields).not.toHaveProperty("extendedKeyUsages");
    expect(fields.isCA).toBe(false);
  });

  // The row's commonName has to match the certificate that was actually signed: on the CSR paths the
  // issued subject comes from a subjectOverride the CSR itself never carried.
  test("reads the common name off the certificate so it wins over the requested one", async () => {
    const pem = await buildCert([new x509.BasicConstraintsExtension(false)], "CN=issued.example.com");

    const fields = extractCertificateFields(pem);

    expect(fields.commonName).toBe("issued.example.com");
    expect({ commonName: "requested.example.com", ...fields }.commonName).toBe("issued.example.com");
  });

  test("omits the common name when the certificate has none, so a NOT NULL column keeps the requested value", async () => {
    const pem = await buildCert([new x509.BasicConstraintsExtension(false)], "");

    const fields = extractCertificateFields(pem);

    expect(fields).not.toHaveProperty("commonName");
    expect({ commonName: "requested.example.com", ...fields }.commonName).toBe("requested.example.com");
  });

  test("omits the common name when the certificate cannot be parsed", () => {
    const fields = extractCertificateFields(Buffer.from("not a certificate"));

    expect(fields).not.toHaveProperty("commonName");
  });

  test("drops extended key usage OIDs it cannot map rather than leaving holes in the array", async () => {
    const pem = await buildCert([
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1", "1.3.6.1.4.1.311.20.2.2", "1.3.6.1.5.5.7.3.17"], false)
    ]);

    const fields = extractCertificateFields(pem);

    expect(fields.extendedKeyUsages).toEqual(["serverAuth", "smartCardLogon"]);
  });
});

describe("resolveCertificateDeletionEligibility", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it("allows an expired certificate", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.ACTIVE, notAfter: past })).toBe(
      CertificateDeletionEligibility.Expired
    );
  });

  it("allows a discovered certificate that has not expired", () => {
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.ACTIVE,
        notAfter: future,
        source: CertificateSource.Discovered
      })
    ).toBe(CertificateDeletionEligibility.Discovered);
  });

  it("allows an imported certificate that has not expired", () => {
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.ACTIVE,
        notAfter: future,
        source: CertificateSource.Imported
      })
    ).toBe(CertificateDeletionEligibility.Imported);
  });

  it("blocks an issued certificate that has not expired", () => {
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.ACTIVE,
        notAfter: future,
        source: CertificateSource.Issued
      })
    ).toBeNull();
  });

  it("blocks a certificate with no source, because issuance never records one", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.ACTIVE, notAfter: future })).toBeNull();
  });

  it("blocks a revoked certificate until it expires, so its serial stays on the CRL", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.REVOKED, notAfter: future })).toBeNull();
  });

  it("blocks a revoked certificate even when its source would exempt it", () => {
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.REVOKED,
        notAfter: future,
        source: CertificateSource.Imported
      })
    ).toBeNull();

    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.REVOKED,
        notAfter: future,
        source: CertificateSource.Discovered
      })
    ).toBeNull();
  });

  it("allows a revoked certificate once it has expired", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.REVOKED, notAfter: past })).toBe(
      CertificateDeletionEligibility.Expired
    );
  });
});

describe("normalizeCaCertChain", () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);

  const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  let serial = 0;

  const genKeys = async () => (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;

  const genCert = async (subject: string, issuer: string, publicKey: CryptoKey, signingKey: CryptoKey) => {
    serial += 1;
    return x509.X509CertificateGenerator.create({
      serialNumber: serial.toString(16).padStart(2, "0"),
      subject,
      issuer,
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2036-01-01"),
      publicKey,
      signingKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
  };

  // Mirrors the checks importCertToCa applies after normalizing the supplied chain.
  const validateChain = async (issued: x509.X509Certificate, supplied: x509.X509Certificate[]) => {
    const certificates = normalizeCaCertChain(issued, supplied);
    if (certificates.length === 0) return { result: "empty" as const };
    const chainItems = await new x509.X509ChainBuilder({ certificates }).build(issued);
    if (chainItems.length === 1) return { result: "issuer-not-found" as const };
    if (chainItems.length !== certificates.length + 1) return { result: "extraneous" as const };
    return { result: "valid" as const, chain: chainItems.slice(1) };
  };

  let root: x509.X509Certificate;
  let issuing: x509.X509Certificate;
  let issuingReissued: x509.X509Certificate;
  let issuingCurrent: x509.X509Certificate;
  let issued: x509.X509Certificate;
  let issuedByRenewed: x509.X509Certificate;

  beforeAll(async () => {
    const rootKeys = await genKeys();
    const issuingKeys = await genKeys();
    const renewedKeys = await genKeys();
    const leafKeys = await genKeys();

    root = await genCert("CN=Root", "CN=Root", rootKeys.publicKey, rootKeys.privateKey);
    issuing = await genCert("CN=Issuing", "CN=Root", issuingKeys.publicKey, rootKeys.privateKey);
    issuingReissued = await genCert("CN=Issuing", "CN=Root", issuingKeys.publicKey, rootKeys.privateKey);
    issuingCurrent = await genCert("CN=Issuing", "CN=Root", renewedKeys.publicKey, rootKeys.privateKey);
    issued = await genCert("CN=Infisical Intermediate", "CN=Issuing", leafKeys.publicKey, issuingKeys.privateKey);
    issuedByRenewed = await genCert(
      "CN=Infisical Intermediate",
      "CN=Issuing",
      leafKeys.publicKey,
      renewedKeys.privateKey
    );
  });

  test("accepts an issuer-to-root chain regardless of order and returns it issuer-first", async () => {
    const ordered = await validateChain(issued, [issuing, root]);
    expect(ordered.result).toBe("valid");
    expect(ordered.chain?.map((c) => c.subject)).toEqual(["CN=Issuing", "CN=Root"]);

    const reversed = await validateChain(issued, [root, issuing]);
    expect(reversed.result).toBe("valid");
    expect(reversed.chain?.map((c) => c.subject)).toEqual(["CN=Issuing", "CN=Root"]);
  });

  test("accepts a chain that only contains the issuing CA", async () => {
    expect((await validateChain(issued, [issuing])).result).toBe("valid");
  });

  test("drops the issued certificate when the chain includes it", async () => {
    expect(normalizeCaCertChain(issued, [issued, issuing, root])).toHaveLength(2);
    expect((await validateChain(issued, [issued, issuing, root])).result).toBe("valid");
  });

  test("drops duplicate CA certificates", async () => {
    expect(normalizeCaCertChain(issued, [issuing, issuing, root, root])).toHaveLength(2);
    expect((await validateChain(issued, [issuing, issuing, root, root])).result).toBe("valid");
  });

  test("rejects a chain that only contains the issued certificate", async () => {
    expect((await validateChain(issued, [issued])).result).toBe("empty");
  });

  test("rejects the chain of a superseded CA certificate after a new-key renewal", async () => {
    expect((await validateChain(issuedByRenewed, [issuing, root])).result).toBe("issuer-not-found");
  });

  test("accepts the current CA certificate after a new-key renewal", async () => {
    expect((await validateChain(issuedByRenewed, [issuingCurrent, root])).result).toBe("valid");
  });

  test("rejects certificates that are not on the issuing path", async () => {
    expect((await validateChain(issuedByRenewed, [issuing, issuingCurrent, root])).result).toBe("extraneous");
  });

  test("keeps distinct certificates for the same CA key", async () => {
    expect(normalizeCaCertChain(issued, [issuing, issuingReissued])).toHaveLength(2);
  });
});
