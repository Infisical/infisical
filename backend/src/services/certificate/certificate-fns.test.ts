import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { BadRequestError } from "@app/lib/errors";

import {
  buildCertificateBundle,
  CertificateThumbprintAlgorithm,
  extractCertificateFields,
  normalizeThumbprint,
  parseCertificateBody,
  resolveCertificateLifecycleStatus
} from "./certificate-fns";
import { CertStatus } from "./certificate-types";

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

  const buildCert = async (extensions: x509.Extension[]) => {
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
      name: "CN=probe.example.com",
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
});

describe("resolveCertificateLifecycleStatus", () => {
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 1000);

  test("reports active when nothing has happened to the certificate", () => {
    expect(resolveCertificateLifecycleStatus({ status: CertStatus.ACTIVE, notAfter: future })).toBe(CertStatus.ACTIVE);
  });

  test("reports renewed once a replacement has been issued", () => {
    expect(
      resolveCertificateLifecycleStatus({
        status: CertStatus.ACTIVE,
        notAfter: future,
        renewedByCertificateId: "b7c1f4e2-0000-4000-8000-000000000001"
      })
    ).toBe(CertStatus.RENEWED);
  });

  test("prefers expired over renewed", () => {
    expect(
      resolveCertificateLifecycleStatus({
        status: CertStatus.ACTIVE,
        notAfter: past,
        renewedByCertificateId: "b7c1f4e2-0000-4000-8000-000000000001"
      })
    ).toBe(CertStatus.EXPIRED);
  });

  test("prefers revoked over both expired and renewed", () => {
    expect(
      resolveCertificateLifecycleStatus({
        status: CertStatus.REVOKED,
        notAfter: past,
        renewedByCertificateId: "b7c1f4e2-0000-4000-8000-000000000001"
      })
    ).toBe(CertStatus.REVOKED);
  });

  test("treats the expiry boundary as expired", () => {
    const now = new Date();
    expect(resolveCertificateLifecycleStatus({ status: CertStatus.ACTIVE, notAfter: now })).toBe(CertStatus.EXPIRED);
  });

  test("accepts an ISO string notAfter, as returned over the API", () => {
    expect(resolveCertificateLifecycleStatus({ status: CertStatus.ACTIVE, notAfter: future.toISOString() })).toBe(
      CertStatus.ACTIVE
    );
  });
});
