import { createPrivateKey, generateKeyPairSync, webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { TCertificates } from "@app/db/schemas";
import { CertificateSource } from "@app/ee/services/pki-discovery/pki-discovery-types";
import { BadRequestError } from "@app/lib/errors";

import {
  assertCertificateMaterialAvailable,
  assertCertificateNotDeleted,
  buildCertificateBundle,
  buildRestoredImportData,
  canRestoreDeletedCertificate,
  CertificateThumbprintAlgorithm,
  extractCertificateFields,
  extractExternallyIssuedCertificateFields,
  getCertificateDisplayName,
  linkRenewedCertificate,
  lockRenewalOriginalCertificate,
  normalizePemText,
  normalizeThumbprint,
  parseCertificateBody,
  parsePemCertificateChain,
  resolveCertificateDeletionEligibility,
  resolveCertificateStatus
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

describe("resolveCertificateStatus", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it("derives revoked > expired > renewed > active from the stored columns", () => {
    expect(resolveCertificateStatus({ status: CertStatus.REVOKED, notAfter: past })).toBe(CertStatus.REVOKED);
    expect(
      resolveCertificateStatus({ status: CertStatus.ACTIVE, notAfter: past, renewedByCertificateId: "next" })
    ).toBe(CertStatus.EXPIRED);
    expect(
      resolveCertificateStatus({ status: CertStatus.ACTIVE, notAfter: future, renewedByCertificateId: "next" })
    ).toBe(CertStatus.RENEWED);
    expect(resolveCertificateStatus({ status: CertStatus.ACTIVE, notAfter: future })).toBe(CertStatus.ACTIVE);
  });
});

describe("resolveCertificateDeletionEligibility", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000);

  it("reports an expired certificate", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.REVOKED, notAfter: past })).toBe(
      CertificateDeletionEligibility.Expired
    );
  });

  it("reports discovered and imported certificates by source, revoked or not", () => {
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.REVOKED,
        notAfter: future,
        source: CertificateSource.Discovered
      })
    ).toBe(CertificateDeletionEligibility.Discovered);
    expect(
      resolveCertificateDeletionEligibility({
        status: CertStatus.ACTIVE,
        notAfter: future,
        source: CertificateSource.Imported
      })
    ).toBe(CertificateDeletionEligibility.Imported);
  });

  it("always returns a reason, so the audit event keeps the field", () => {
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.ACTIVE, notAfter: future })).toBe(
      CertificateDeletionEligibility.Issued
    );
    expect(resolveCertificateDeletionEligibility({ status: CertStatus.REVOKED, notAfter: future })).toBe(
      CertificateDeletionEligibility.Issued
    );
  });
});

describe("deleted certificate guards", () => {
  const deletedAt = new Date("2026-10-20T14:38:27.000Z");
  const certificate = { friendlyName: "web", commonName: "web.example.com", serialNumber: "0a1b2c" };

  it("lets a certificate that was never deleted through", () => {
    expect(() => assertCertificateMaterialAvailable(certificate)).not.toThrow();
    expect(() => assertCertificateNotDeleted({ ...certificate, deletedAt: null })).not.toThrow();
  });

  it("refuses the certificate and private key of a deleted certificate, naming it and the date", () => {
    expect(() => assertCertificateMaterialAvailable({ ...certificate, deletedAt })).toThrow(
      new BadRequestError({
        message:
          "Certificate 'web' was deleted on 2026-10-20T14:38:27.000Z. Its certificate and private key are no longer available."
      })
    );
  });

  it("refuses to act on a deleted certificate", () => {
    expect(() => assertCertificateNotDeleted({ ...certificate, deletedAt })).toThrow(BadRequestError);
    expect(() => assertCertificateNotDeleted({ ...certificate, deletedAt })).toThrow(
      "Certificate 'web' was deleted on 2026-10-20T14:38:27.000Z and can no longer be renewed or changed."
    );
  });

  it("falls back to the common name and then the serial number when the name is empty", () => {
    expect(getCertificateDisplayName({ ...certificate, friendlyName: "" })).toBe("web.example.com");
    expect(getCertificateDisplayName({ ...certificate, friendlyName: "", commonName: "" })).toBe("0a1b2c");
  });
});

describe("renewal link", () => {
  const tx = {} as Parameters<typeof linkRenewedCertificate>[3];

  it("points the locked original at its successor and carries the order over", async () => {
    const dal = { updateById: vi.fn().mockResolvedValue({}) };

    await linkRenewedCertificate(dal, { id: "cert-old", orderId: "order-1" }, "cert-new", tx);

    expect(dal.updateById).toHaveBeenCalledWith("cert-new", { orderId: "order-1" }, tx);
    expect(dal.updateById).toHaveBeenCalledWith("cert-old", { renewedByCertificateId: "cert-new" }, tx);
  });

  it("refuses to lock a certificate deleted while the renewal was in flight", async () => {
    const dal = {
      findByIdForUpdate: vi.fn().mockResolvedValue({
        id: "cert-old",
        commonName: "web.example.com",
        serialNumber: "01",
        deletedAt: new Date("2026-10-20T14:38:27.000Z")
      })
    };

    await expect(lockRenewalOriginalCertificate(dal, "cert-old", tx)).rejects.toThrow(
      "Certificate 'web.example.com' was deleted on 2026-10-20T14:38:27.000Z and can no longer be renewed or changed."
    );
    expect(dal.findByIdForUpdate).toHaveBeenCalledWith("cert-old", tx);
    await expect(lockRenewalOriginalCertificate(dal, "cert-old", tx, "7f02")).rejects.toThrow(
      "The certificate authority already issued the renewed certificate with serial number '7f02'."
    );
  });
});

describe("normalizePemText", () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pkcs8Pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
  const pkcs1Pem = privateKey.export({ type: "pkcs1", format: "pem" }).toString().trim();
  const lines = pkcs8Pem.split("\n");

  const damagedVariants: Record<string, string> = {
    "newlines removed": lines.join(""),
    "newlines replaced with spaces": lines.join(" "),
    "double-escaped newlines": lines.join("\\n"),
    "indented lines": lines.map((line) => `    ${line}`).join("\n"),
    "non-breaking spaces": lines.join("\n\u00a0"),
    "zero-width spaces": lines.join("\n\u200b"),
    "en dashes in the armor": pkcs8Pem.replace(/-----/g, "\u2013\u2013\u2013\u2013\u2013"),
    "blank line in the body": [...lines.slice(0, 3), "", ...lines.slice(3)].join("\n")
  };

  test.each(Object.entries(damagedVariants))("repairs a private key with %s", (_, damaged) => {
    expect(() => createPrivateKey(damaged)).toThrow();
    expect(normalizePemText(damaged)).toBe(pkcs8Pem);
    expect(() => createPrivateKey(normalizePemText(damaged))).not.toThrow();
  });

  test("canonicalizes parseable variants", () => {
    expect(normalizePemText(lines.join("\r\n"))).toBe(pkcs8Pem);
    expect(normalizePemText(`Bag Attributes\n    localKeyID: 01 02\n${pkcs8Pem}`)).toBe(pkcs8Pem);
  });

  test("leaves well-formed PEM unchanged", () => {
    expect(normalizePemText(pkcs8Pem)).toBe(pkcs8Pem);
    expect(normalizePemText(pkcs1Pem)).toBe(pkcs1Pem);
  });

  test("keeps every block of a multi-block bundle in order", () => {
    const bundle = `${pkcs8Pem}\n${pkcs1Pem}`;
    expect(normalizePemText(bundle.replace(/\n/g, ""))).toBe(bundle);
  });

  test("returns trimmed input when no PEM block is found", () => {
    expect(normalizePemText("  not a pem  ")).toBe("not a pem");
  });

  test("returns the input untouched when any block cannot be rebuilt", () => {
    const damagedSecond = `${pkcs8Pem}\n${pkcs1Pem.replace("END RSA PRIVATE KEY", "END PRIVATE KEY")}`;
    expect(normalizePemText(`  ${damagedSecond}  `)).toBe(damagedSecond);
  });
});

describe("parsePemCertificateChain", () => {
  beforeAll(() => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  });

  const makeCertPem = async (commonName: string) => {
    const keys = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned({
      name: `CN=${commonName}`,
      keys: keys as CryptoKeyPair,
      signingAlgorithm: { name: "ECDSA", hash: "SHA-256" },
      notBefore: new Date(),
      notAfter: new Date(Date.now() + 86_400_000)
    });
    return cert.toString("pem");
  };

  test("parses every certificate in the chain", async () => {
    const chain = `${await makeCertPem("Intermediate")}\n${await makeCertPem("Root")}`;
    expect(parsePemCertificateChain(chain)?.map((cert) => cert.subject)).toEqual(["CN=Intermediate", "CN=Root"]);
  });

  test("rejects a chain with a block that does not split out", async () => {
    const root = (await makeCertPem("Root")).replace("END CERTIFICATE", "END X509 CERTIFICATE");
    expect(parsePemCertificateChain(`${await makeCertPem("Intermediate")}\n${root}`)).toBeNull();
  });

  test("rejects a chain with a block that does not parse", async () => {
    const rootLines = (await makeCertPem("Root")).split("\n");
    rootLines[2] = `${rootLines[2].slice(0, 5)}!${rootLines[2].slice(6)}`;
    expect(parsePemCertificateChain(`${await makeCertPem("Intermediate")}\n${rootLines.join("\n")}`)).toBeNull();
  });
});

describe("buildRestoredImportData", () => {
  const deleted = {
    id: "cert-1",
    friendlyName: "web",
    commonName: "web.example.com",
    serialNumber: "0a1b",
    fingerprintSha256: "AA:BB",
    projectId: "project-1",
    applicationId: null,
    caId: "ca-1",
    profileId: "profile-1",
    externalMetadata: null,
    source: null
  } as unknown as TCertificates;
  const imported: {
    projectId: string;
    applicationId: string | null;
    caId: string | null;
    profileId: string | null;
    externalMetadata: unknown;
    source: string;
    fingerprintSha256: string;
    altNames: string;
    renewBeforeDays?: number;
  } = {
    projectId: "project-1",
    applicationId: null,
    caId: null,
    profileId: null,
    externalMetadata: null,
    source: CertificateSource.Imported,
    fingerprintSha256: "AA:BB",
    altNames: "web.example.com"
  };

  it("keeps the deleted row's issuer link and clears stale state", () => {
    const restored = buildRestoredImportData(deleted, imported);

    expect(restored.caId).toBe("ca-1");
    expect(restored.profileId).toBe("profile-1");
    expect(restored.source).toBeNull();
    expect(restored.renewalError).toBeNull();
    expect(restored.renewBeforeDays).toBeNull();
  });

  it("marks a restored discovered certificate as imported", () => {
    const restored = buildRestoredImportData(
      { ...deleted, caId: null, profileId: null, source: CertificateSource.Discovered },
      imported
    );

    expect(restored.source).toBe(CertificateSource.Imported);
  });

  it("restores only into the same project, Application, profile and certificate authority", () => {
    const deletedRow = { ...deleted, deletedAt: new Date("2026-10-20T14:38:27.000Z") };
    expect(canRestoreDeletedCertificate(deletedRow, imported)).toBe(false);
    expect(canRestoreDeletedCertificate(deletedRow, { ...imported, profileId: "profile-1", caId: "ca-1" })).toBe(true);
    expect(canRestoreDeletedCertificate(deletedRow, { ...imported, profileId: "profile-1" })).toBe(true);
    expect(canRestoreDeletedCertificate({ ...deletedRow, profileId: null, caId: null }, imported)).toBe(true);
    expect(canRestoreDeletedCertificate({ ...deletedRow, profileId: null }, imported)).toBe(false);
    expect(canRestoreDeletedCertificate(deletedRow, { ...imported, applicationId: "app-2" })).toBe(false);
    expect(canRestoreDeletedCertificate(deletedRow, { ...imported, profileId: "profile-2" })).toBe(false);
    expect(canRestoreDeletedCertificate(deletedRow, { ...imported, caId: "ca-2" })).toBe(false);
    expect(
      canRestoreDeletedCertificate(deletedRow, { ...imported, projectId: "project-2", profileId: "profile-1" })
    ).toBe(false);
    expect(canRestoreDeletedCertificate(deleted, imported)).toBe(false);
  });
});
