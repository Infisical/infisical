import { webcrypto } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CertExtendedKeyUsageType,
  CertKeyAlgorithm,
  CertKeyUsageType,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import {
  assertCsrRenewalAttributes,
  buildRenewalCertificateRequest,
  certificateSpanToTtl,
  importKeyPairFromPem,
  resolveRenewalKeySource
} from "./certificate-renewal-fns";
import { CertificateRenewalKeySource } from "./certificate-v3-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const original: TCertificateRequest = {
  commonName: "web.example.com",
  organization: "Example Corp",
  organizationalUnit: "Platform Engineering",
  country: "US",
  state: "California",
  locality: "San Francisco",
  domainComponents: ["example", "com"],
  keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT],
  extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
  subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "web.example.com" }],
  validity: { ttl: "30d" },
  keyAlgorithm: "RSA_2048",
  signatureAlgorithm: "RSA-SHA256"
};

describe("resolveRenewalKeySource", () => {
  it("defaults to a new key pair", () => {
    expect(resolveRenewalKeySource({})).toBe(CertificateRenewalKeySource.New);
  });

  it("resolves each source", () => {
    expect(resolveRenewalKeySource({ renewalKeySource: CertificateRenewalKeySource.Reuse })).toBe(
      CertificateRenewalKeySource.Reuse
    );
    expect(resolveRenewalKeySource({ renewalKeySource: CertificateRenewalKeySource.Csr, csr: "csr" })).toBe(
      CertificateRenewalKeySource.Csr
    );
  });

  it("rejects a CSR alongside any other key source, and a csr source without one", () => {
    expect(() => resolveRenewalKeySource({ renewalKeySource: CertificateRenewalKeySource.Csr })).toThrow(
      /signing request is required/
    );
    expect(() => resolveRenewalKeySource({ renewalKeySource: CertificateRenewalKeySource.Reuse, csr: "csr" })).toThrow(
      /only be supplied with renewalKeySource 'csr'/
    );
    expect(() => resolveRenewalKeySource({ csr: "csr" })).toThrow(/only be supplied with renewalKeySource 'csr'/);
  });
});

describe("assertCsrRenewalAttributes", () => {
  it("allows validity and basic constraints", () => {
    expect(() => assertCsrRenewalAttributes({ ttl: "30d", basicConstraints: { isCA: false } })).not.toThrow();
  });

  it("rejects anything the CSR already carries, naming the fields", () => {
    expect(() => assertCsrRenewalAttributes({ commonName: "other.example.com", ttl: "30d" })).toThrow(/common name/);
    expect(() =>
      assertCsrRenewalAttributes({ altNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "a.com" }] })
    ).toThrow(/subject alternative names/);
  });

  it("ignores keys that are present but undefined", () => {
    expect(() => assertCsrRenewalAttributes({ commonName: undefined, ttl: "30d" })).not.toThrow();
  });
});

describe("buildRenewalCertificateRequest", () => {
  it("returns the certificate unchanged when nothing was supplied", () => {
    expect(buildRenewalCertificateRequest({ original })).toEqual(original);
    expect(buildRenewalCertificateRequest({ original, attributes: {} })).toEqual(original);
  });

  it("applies only the fields the caller supplied", () => {
    const result = buildRenewalCertificateRequest({
      original,
      attributes: { commonName: "api.example.com", ttl: "90d" }
    });

    expect(result.commonName).toBe("api.example.com");
    expect(result.validity).toEqual({ ttl: "90d" });
    expect(result.organization).toBe("Example Corp");
    expect(result.locality).toBe("San Francisco");
    expect(result.keyUsages).toEqual(original.keyUsages);
    expect(result.subjectAlternativeNames).toEqual(original.subjectAlternativeNames);
  });

  it("clears a field when it is explicitly set to null", () => {
    const result = buildRenewalCertificateRequest({
      original,
      attributes: { organizationalUnit: null, domainComponents: null }
    });

    expect(result.organizationalUnit).toBeUndefined();
    expect(result.domainComponents).toBeUndefined();
    expect(result.organization).toBe("Example Corp");
  });

  it("replaces list-valued fields wholesale rather than merging them", () => {
    const result = buildRenewalCertificateRequest({
      original,
      attributes: {
        altNames: [{ type: CertSubjectAlternativeNameType.IP_ADDRESS, value: "10.0.0.1" }],
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE]
      }
    });

    expect(result.subjectAlternativeNames).toEqual([
      { type: CertSubjectAlternativeNameType.IP_ADDRESS, value: "10.0.0.1" }
    ]);
    expect(result.keyUsages).toEqual([CertKeyUsageType.DIGITAL_SIGNATURE]);
    expect(result.extendedKeyUsages).toEqual(original.extendedKeyUsages);
  });

  it("accepts an empty SAN list as a real instruction to remove them", () => {
    const result = buildRenewalCertificateRequest({ original, attributes: { altNames: [] } });
    expect(result.subjectAlternativeNames).toEqual([]);
  });

  it("carries the algorithms so callers never have to fall back to the certificate's own", () => {
    const result = buildRenewalCertificateRequest({
      original,
      attributes: { keyAlgorithm: CertKeyAlgorithm.ECDSA_P256 }
    });

    expect(result.keyAlgorithm).toBe(CertKeyAlgorithm.ECDSA_P256);
    expect(result.signatureAlgorithm).toBe("RSA-SHA256");
  });
});

describe("certificateSpanToTtl", () => {
  it("expresses the span in the largest whole unit that fits", () => {
    const base = new Date("2026-01-01T00:00:00Z");
    const plus = (ms: number) => new Date(base.getTime() + ms);

    expect(certificateSpanToTtl(base, plus(30 * 24 * 60 * 60 * 1000))).toBe("30d");
    expect(certificateSpanToTtl(base, plus(5 * 60 * 60 * 1000))).toBe("5h");
    expect(certificateSpanToTtl(base, plus(90 * 1000))).toBe("1m");
    expect(certificateSpanToTtl(base, plus(30 * 1000))).toBe("30s");
  });
});

describe("importKeyPairFromPem", () => {
  const generatePkcs8Pem = async (algorithm: RsaHashedKeyGenParams | EcKeyGenParams) => {
    const pair = (await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"])) as CryptoKeyPair;
    const pkcs8 = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey));
    return {
      pem: `-----BEGIN PRIVATE KEY-----\n${pkcs8.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`,
      spki: Buffer.from(await webcrypto.subtle.exportKey("spki", pair.publicKey)).toString("base64")
    };
  };

  it("derives the matching public key from a stored RSA private key", async () => {
    const { pem, spki } = await generatePkcs8Pem({
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    });

    const keyPair = await importKeyPairFromPem({
      privateKeyPem: pem,
      keyAlgorithm: CertKeyAlgorithm.RSA_2048
    });

    const exported = Buffer.from(await webcrypto.subtle.exportKey("spki", keyPair.publicKey)).toString("base64");
    expect(exported).toBe(spki);
  });

  it("derives the matching public key from a stored EC private key", async () => {
    const { pem, spki } = await generatePkcs8Pem({ name: "ECDSA", namedCurve: "P-256" });

    const keyPair = await importKeyPairFromPem({
      privateKeyPem: pem,
      keyAlgorithm: CertKeyAlgorithm.ECDSA_P256
    });

    const exported = Buffer.from(await webcrypto.subtle.exportKey("spki", keyPair.publicKey)).toString("base64");
    expect(exported).toBe(spki);
  });

  it("rejects an unreadable key with a message that names the alternative", async () => {
    await expect(
      importKeyPairFromPem({ privateKeyPem: "not-a-key", keyAlgorithm: CertKeyAlgorithm.RSA_2048 })
    ).rejects.toThrow("Renew with a new key pair");
  });
});
