import { webcrypto } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  CertExtendedKeyUsageType,
  CertKeyAlgorithm,
  CertKeyUsageType,
  CertSignatureAlgorithm,
  CertSubjectAlternativeNameType
} from "../certificate-common/certificate-constants";
import { encodeCustomExtensionValue } from "../certificate-common/certificate-extension-fns";
import { TCertificateRequest } from "../certificate-policy/certificate-policy-types";
import {
  assertCsrRenewalAttributes,
  buildCsrRenewalCertificateRequest,
  buildRenewalAuditChanges,
  buildRenewalCertificateRequest,
  certificateSpanToTtl,
  importKeyPairFromPem,
  isCertificateContentEdit,
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

  it("allows custom extensions, which a CSR never supplies on its own", () => {
    expect(() =>
      assertCsrRenewalAttributes({ customExtensions: [{ oid: "1.3.6.1.4.1.99001.1", value: "ops-prod" }] })
    ).not.toThrow();
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

const CSR_PEM = `-----BEGIN CERTIFICATE REQUEST-----
MIICyjCCAbICAQAwQzEdMBsGA1UEAwwUZnJvbS1jc3IuZXhhbXBsZS5jb20xFTAT
BgNVBAoMDEV4YW1wbGUgQ29ycDELMAkGA1UEBhMCVVMwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDK2rfCBjscc47ffKzImc4cs8ARSAoVdxxhUwRIPRKa
oWazByeQVSCDPj8L7C1WvGaNpre29G7nIe9+T1gvR2x00PJ62TE7fKNcLvEl4+zV
W2wZ4/P/SV5/t7yAlnd+oYvc8NQ7I5648/elzb9LXPzSY7MwHJjNKVZmqzUG/S6J
6bPa20i/WB4A5kLtiNWN5UZRZMG4tWknqpPoGflM5UC/vHdcIXwOEaB8BOEGqhKs
pfqclrq5eIXqN9fUmVTSLIDj5aIRS90fz9MLt9aIEZy+ixEC68KWkkmAtqoVqNZZ
CM17KYqHlbSdNh2sxNCxlqtCN4fQOsvKW4LpckaxjJIdAgMBAAGgQjBABgkqhkiG
9w0BCQ4xMzAxMC8GA1UdEQQoMCaCEWNzci1hLmV4YW1wbGUuY29tghFjc3ItYi5l
eGFtcGxlLmNvbTANBgkqhkiG9w0BAQsFAAOCAQEAYImLw0nLLorTvLwwmc5pTwq/
fLEbNmU/UGU5yirTE6ZvZ4m7Ux5yoLLlEGj8FkhSRbIa/yNlX8O/fE62Bv0spQ1j
MdNVsXe6Nk5bDh3IbxUrDFw7LzGMkkE3mbskHWoQDKHY7RLgGkrPxDZuEb6sUOv0
hIi0sn3rB6UncFoh09lzp2P7PMOuRT3WAZV2e3Sp0Iniiz8GUtGMdu98saC+or6Y
nK6dxfdkgRRPX+0Z/Su41uX6QBh1tbHdHY7mL0ZuqlD6cUQ8L/vHNzRJVY7hxhI2
r5EYNQvwLPvpPtwb6/5hKykcW6t2IDZNu8d5cg2hXI74eBjZCo8M+W+E/SDi8A==
-----END CERTIFICATE REQUEST-----`;

describe("buildRenewalAuditChanges", () => {
  const cert = {
    commonName: "web.example.com",
    altNames: "web.example.com",
    keyUsages: ["digitalSignature"],
    extendedKeyUsages: ["serverAuth"],
    signatureAlgorithm: "RSA-SHA256",
    keyAlgorithm: "RSA_2048",
    subjectOrganization: "Example Corp",
    subjectOrganizationalUnit: null,
    subjectCountry: "US",
    subjectState: null,
    subjectLocality: null,
    subjectDomainComponents: null,
    isCA: false,
    pathLength: null,
    notBefore: new Date("2026-01-01T00:00:00Z"),
    notAfter: new Date("2026-01-31T00:00:00Z")
  };

  const unchangedRequest: TCertificateRequest = {
    commonName: "web.example.com",
    organization: "Example Corp",
    country: "US",
    subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "web.example.com" }],
    keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE],
    extendedKeyUsages: [CertExtendedKeyUsageType.SERVER_AUTH],
    signatureAlgorithm: CertSignatureAlgorithm.RSA_SHA256,
    keyAlgorithm: CertKeyAlgorithm.RSA_2048,
    validity: { ttl: "30d" }
  };

  it("records nothing when the renewal reproduces the certificate", () => {
    expect(buildRenewalAuditChanges(cert, unchangedRequest)).toEqual([]);
  });

  it("records a custom extension change with the readable values, not their DER", () => {
    const withExtension = {
      ...cert,
      customExtensions: [
        {
          oid: "1.3.6.1.4.1.99001.1",
          critical: false,
          value: encodeCustomExtensionValue("1.3.6.1.4.1.99001.1", "before")
        }
      ]
    };

    const changes = buildRenewalAuditChanges(withExtension, {
      ...unchangedRequest,
      customExtensions: [{ oid: "1.3.6.1.4.1.99001.1", value: "after" }]
    });

    expect(changes).toEqual([
      { field: "customExtensions", from: "1.3.6.1.4.1.99001.1=before", to: "1.3.6.1.4.1.99001.1=after" }
    ]);
  });

  it("records nothing when the custom extensions are unchanged", () => {
    const withExtension = {
      ...cert,
      customExtensions: [
        {
          oid: "1.3.6.1.4.1.99001.1",
          critical: false,
          value: encodeCustomExtensionValue("1.3.6.1.4.1.99001.1", "same")
        }
      ]
    };

    expect(
      buildRenewalAuditChanges(withExtension, {
        ...unchangedRequest,
        customExtensions: [{ oid: "1.3.6.1.4.1.99001.1", value: "same" }]
      })
    ).toEqual([]);
  });

  it("does not report a change when stored legacy usage names resolve to the same usages", () => {
    expect(
      buildRenewalAuditChanges(cert, { ...unchangedRequest, keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE] })
    ).toEqual([]);
  });

  it("records before and after for each changed attribute", () => {
    expect(
      buildRenewalAuditChanges(cert, {
        ...unchangedRequest,
        commonName: "api.example.com",
        subjectAlternativeNames: [{ type: CertSubjectAlternativeNameType.DNS_NAME, value: "api.example.com" }],
        validity: { ttl: "90d" }
      })
    ).toEqual([
      { field: "commonName", from: "web.example.com", to: "api.example.com" },
      { field: "altNames", from: "web.example.com", to: "api.example.com" },
      { field: "ttl", from: "30d", to: "90d" }
    ]);
  });

  it("records a cleared field as an empty value", () => {
    expect(buildRenewalAuditChanges(cert, { ...unchangedRequest, organization: undefined })).toEqual([
      { field: "organization", from: "Example Corp", to: "" }
    ]);
  });

  it("renders basic constraints and lists readably", () => {
    expect(
      buildRenewalAuditChanges(cert, {
        ...unchangedRequest,
        basicConstraints: { isCA: true, pathLength: 2 },
        keyUsages: [CertKeyUsageType.DIGITAL_SIGNATURE, CertKeyUsageType.KEY_ENCIPHERMENT]
      })
    ).toEqual([
      { field: "keyUsages", from: "digital_signature", to: "digital_signature,key_encipherment" },
      { field: "basicConstraints", from: "isCA=false", to: "isCA=true pathLength=2" }
    ]);
  });

  it("records the subject a CSR renewal rewrites, which never appears in the request attributes", () => {
    const fromCsr = buildCsrRenewalCertificateRequest({ csr: CSR_PEM, attributes: { ttl: "30d" } });

    expect(buildRenewalAuditChanges(cert, fromCsr)).toEqual(
      expect.arrayContaining([
        { field: "commonName", from: "web.example.com", to: "from-csr.example.com" },
        { field: "altNames", from: "web.example.com", to: "csr-a.example.com,csr-b.example.com" }
      ])
    );
  });
});

describe("isCertificateContentEdit", () => {
  it("is false for a renewal that supplies nothing", () => {
    expect(isCertificateContentEdit({ keySource: CertificateRenewalKeySource.New })).toBe(false);
    expect(isCertificateContentEdit({ keySource: CertificateRenewalKeySource.New, attributes: {} })).toBe(false);
    expect(isCertificateContentEdit({ keySource: CertificateRenewalKeySource.Reuse, attributes: {} })).toBe(false);
  });

  it("is true when any attribute is supplied, including one that clears a field", () => {
    expect(isCertificateContentEdit({ keySource: CertificateRenewalKeySource.New, attributes: { ttl: "90d" } })).toBe(
      true
    );
    expect(
      isCertificateContentEdit({ keySource: CertificateRenewalKeySource.New, attributes: { organization: null } })
    ).toBe(true);
  });

  it("is true for a CSR renewal, which rewrites the subject from the CSR", () => {
    expect(isCertificateContentEdit({ keySource: CertificateRenewalKeySource.Csr })).toBe(true);
  });
});
