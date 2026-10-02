import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { BadRequestError } from "@app/lib/errors";

import {
  buildCertificateBundle,
  CertificateThumbprintAlgorithm,
  extractCertificateFields,
  extractExternallyIssuedCertificateFields,
  normalizeThumbprint,
  parseCertificateBody,
  resolveCertificateDeletionEligibility
} from "./certificate-fns";
import { CertExtendedKeyUsage, CertificateDeletionEligibility, CertKeyUsage, CertStatus } from "./certificate-types";

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

describe("extractExternallyIssuedCertificateFields", () => {
  x509.cryptoProvider.set(webcrypto as unknown as Crypto);

  const SCT_LIST_OID = "1.3.6.1.4.1.11129.2.4.2";
  const TEMPLATE_NAME_OID = "1.3.6.1.4.1.311.20.2";

  const buildIssuedCert = async (extensions: x509.Extension[], name = "CN=issued.example.com,O=Issued Corp") => {
    const keys = await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-384",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 3072
      },
      true,
      ["sign", "verify"]
    );

    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: "02",
      name,
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2027-01-01"),
      keys: keys as CryptoKeyPair,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-384" },
      extensions
    });

    return cert;
  };

  test("records every extension the certificate carries, flagging the ones the request never asked for", async () => {
    const requestedValue = Buffer.from([0x0c, 0x07, 0x4d, 0x61, 0x63, 0x68, 0x69, 0x6e, 0x65]);
    const issued = await buildIssuedCert([
      new x509.Extension(TEMPLATE_NAME_OID, false, requestedValue),
      new x509.Extension(SCT_LIST_OID, false, Buffer.from([0x04, 0x02, 0x00, 0x42]))
    ]);

    const fields = extractExternallyIssuedCertificateFields(issued, [
      { oid: TEMPLATE_NAME_OID, critical: false, value: requestedValue.toString("base64") }
    ]);

    expect(JSON.parse(fields.customExtensions as string)).toEqual([
      { oid: SCT_LIST_OID, critical: false, value: "BAIAQg==", issuerAdded: true },
      { oid: TEMPLATE_NAME_OID, critical: false, value: requestedValue.toString("base64") }
    ]);
  });

  test("reads the subject, algorithms and subject alternative names the CA actually issued", async () => {
    const issued = await buildIssuedCert([
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: "issued.example.com" },
        { type: "dns", value: "added-by-ca.example.com" }
      ])
    ]);

    const fields = extractExternallyIssuedCertificateFields(issued);

    expect(fields.commonName).toBe("issued.example.com");
    expect(fields.subjectOrganization).toBe("Issued Corp");
    expect(fields.altNames).toBe("issued.example.com,added-by-ca.example.com");
    expect(fields.keyAlgorithm).toBe("RSA_3072");
    expect(fields.signatureAlgorithm).toBe("RSA-SHA384");
  });

  // Otherwise each renewal asks for the duplicate again and the list grows until it overruns 4096.
  test("collapses a repeated subject alternative name so renewals cannot accumulate copies", async () => {
    const issued = await buildIssuedCert([
      new x509.SubjectAlternativeNameExtension([
        { type: "dns", value: "issued.example.com" },
        { type: "dns", value: "added.example.com" },
        { type: "dns", value: "issued.example.com" }
      ])
    ]);

    const fields = extractExternallyIssuedCertificateFields(issued);

    expect(fields.altNames).toBe("issued.example.com,added.example.com");
  });

  // The column is text, so a long list from a public CA is recorded in full rather than trimmed to
  // whatever fit. Requests stay bounded at 4096 characters by the policy schema.
  test("records every subject alternative name, past the old column width", async () => {
    const many = Array.from({ length: 200 }, (_, index) => ({
      type: "dns" as const,
      value: `host-${String(index).padStart(3, "0")}.${"padding".repeat(4)}.example.com`
    }));
    const issued = await buildIssuedCert([new x509.SubjectAlternativeNameExtension(many)]);

    const fields = extractExternallyIssuedCertificateFields(issued);

    expect(many.map((san) => san.value).join(",").length).toBeGreaterThan(4096);
    expect(fields.altNames).toBe(many.map((san) => san.value).join(","));
  });

  test("leaves the requested subject alternative names in place when the certificate carries none", async () => {
    const issued = await buildIssuedCert([new x509.BasicConstraintsExtension(false)]);

    const fields = extractExternallyIssuedCertificateFields(issued);

    expect(fields).not.toHaveProperty("altNames");
    expect(fields.altNames ?? "requested.example.com").toBe("requested.example.com");
  });

  test("omits a field the certificate does not carry rather than carrying it as null", async () => {
    const issued = await buildIssuedCert([new x509.BasicConstraintsExtension(false)], "O=No Common Name Corp");

    const fields = extractExternallyIssuedCertificateFields(issued);

    for (const field of ["commonName", "altNames", "keyUsages", "extendedKeyUsages"]) {
      expect(fields).not.toHaveProperty(field);
    }

    expect(fields.commonName ?? "requested.example.com").toBe("requested.example.com");
    expect(fields.keyUsages ?? [CertKeyUsage.KEY_AGREEMENT]).toEqual([CertKeyUsage.KEY_AGREEMENT]);
    expect(fields.extendedKeyUsages ?? [CertExtendedKeyUsage.CLIENT_AUTH]).toEqual([CertExtendedKeyUsage.CLIENT_AUTH]);
  });

  test("always names the algorithms, so a create payload never falls back to the requested ones", async () => {
    const issued = await buildIssuedCert([new x509.BasicConstraintsExtension(false)]);

    const fields = extractExternallyIssuedCertificateFields(issued);

    expect(fields.keyAlgorithm ?? "RSA_2048").toBe("RSA_3072");
    expect(fields.signatureAlgorithm ?? "RSA-SHA256").toBe("RSA-SHA384");
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
