import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import {
  buildAuthorityInfoAccessExtension,
  buildCrlDistributionPointUrls,
  buildIssuedCertificateChain,
  buildOcspResponderUrl,
  createDistinguishedName,
  extractDnParts,
  signatureAlgorithmToAlgCfg,
  validateCrossSignedCertificate
} from "./certificate-authority-fns";

// Helper to access properties on the union return type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asRecord = (obj: any) => obj as Record<string, unknown>;

describe("signatureAlgorithmToAlgCfg", () => {
  describe("RSA algorithms", () => {
    it("should handle RSA-SHA256 correctly", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA256", CertKeyAlgorithm.RSA_2048);

      expect(result).toEqual({
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048
      });
    });

    it("should handle RSA-SHA384 correctly", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA384", CertKeyAlgorithm.RSA_4096);

      expect(result).toEqual({
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-384",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 4096
      });
    });

    it("should handle RSA-SHA256 with RSA_3072 correctly", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA256", CertKeyAlgorithm.RSA_3072);

      expect(result).toEqual({
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 3072
      });
    });

    it("should handle RSA-SHA512 correctly", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA512", CertKeyAlgorithm.RSA_2048);

      expect(result).toEqual({
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-512",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048
      });
    });
  });

  describe("ECDSA algorithms", () => {
    it("should handle ECDSA-SHA256 with P-256 curve", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", CertKeyAlgorithm.ECDSA_P256);

      expect(result).toEqual({
        name: "ECDSA",
        namedCurve: "P-256",
        hash: "SHA-256"
      });
    });

    it("should handle ECDSA-SHA384 with P-384 curve", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA384", CertKeyAlgorithm.ECDSA_P384);

      expect(result).toEqual({
        name: "ECDSA",
        namedCurve: "P-384",
        hash: "SHA-384"
      });
    });

    it("should handle ECDSA-SHA256 with EC_prime256v1 string format", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", "EC_prime256v1");

      expect(result).toEqual({
        name: "ECDSA",
        namedCurve: "P-256",
        hash: "SHA-256"
      });
    });

    it("should handle ECDSA-SHA384 with EC_secp384r1 string format", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA384", "EC_secp384r1");

      expect(result).toEqual({
        name: "ECDSA",
        namedCurve: "P-384",
        hash: "SHA-384"
      });
    });
  });

  describe("hash format normalization", () => {
    it("should normalize SHA256 to SHA-256", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA256", CertKeyAlgorithm.RSA_2048);
      expect(asRecord(result).hash).toBe("SHA-256");
    });

    it("should normalize SHA384 to SHA-384", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA384", CertKeyAlgorithm.ECDSA_P384);
      expect(asRecord(result).hash).toBe("SHA-384");
    });

    it("should normalize SHA512 to SHA-512", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA512", CertKeyAlgorithm.RSA_4096);
      expect(asRecord(result).hash).toBe("SHA-512");
    });

    it("should handle SHA1 format", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA1", CertKeyAlgorithm.RSA_2048);
      expect(asRecord(result).hash).toBe("SHA-1");
    });

    it("should handle SHA224 format", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA224", CertKeyAlgorithm.ECDSA_P256);
      expect(asRecord(result).hash).toBe("SHA-224");
    });

    it("should handle case insensitive hash normalization", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-sha256", CertKeyAlgorithm.RSA_2048);
      expect(asRecord(result).hash).toBe("SHA-256");
    });

    it("should handle already normalized hash formats", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", CertKeyAlgorithm.ECDSA_P256);
      expect(asRecord(result).hash).toBe("SHA-256");
    });

    it("should handle SHA-3 family hashes", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA3256", CertKeyAlgorithm.RSA_2048);
      expect(asRecord(result).hash).toBe("SHA3-256");
    });
  });

  describe("dynamic key algorithm support", () => {
    it("should support future RSA key sizes", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA256", "RSA_8192");

      expect(result.name).toBe("RSASSA-PKCS1-v1_5");
      expect(asRecord(result).hash).toBe("SHA-256");
    });

    it("should support future EC curves", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", "EC_secp521r1");

      expect(result.name).toBe("ECDSA");
      expect(asRecord(result).namedCurve).toBe("P-521");
      expect(asRecord(result).hash).toBe("SHA-256");
    });

    it("should support EC_P384 string format", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA384", "EC_P384");

      expect(result).toEqual({
        name: "ECDSA",
        namedCurve: "P-384",
        hash: "SHA-384"
      });
    });
  });

  describe("ML-DSA (post-quantum) algorithms", () => {
    it("should handle ML-DSA-44 as a pure signature scheme", () => {
      const result = signatureAlgorithmToAlgCfg("ML-DSA-44", CertKeyAlgorithm.ML_DSA_44);
      expect(result.name).toBe("ML-DSA-44");
    });

    it("should handle ML-DSA-65 as a pure signature scheme", () => {
      const result = signatureAlgorithmToAlgCfg("ML-DSA-65", CertKeyAlgorithm.ML_DSA_65);
      expect(result.name).toBe("ML-DSA-65");
    });

    it("should handle ML-DSA-87 as a pure signature scheme", () => {
      const result = signatureAlgorithmToAlgCfg("ML-DSA-87", CertKeyAlgorithm.ML_DSA_87);
      expect(result.name).toBe("ML-DSA-87");
    });

    it("should return early for ML-DSA without parsing as hash-based algorithm", () => {
      // ML-DSA-44 should NOT be split on "-" and processed as "ML" + "DSA-44"
      const result = signatureAlgorithmToAlgCfg("ML-DSA-87", CertKeyAlgorithm.RSA_2048);
      expect(result.name).toBe("ML-DSA-87");
    });
  });
});

describe("buildCrlDistributionPointUrls", () => {
  const managedUrl = "https://infisical.example.com/api/v1/cert-manager/crl/123/der";

  it("should include managed URL by default", () => {
    const result = buildCrlDistributionPointUrls(managedUrl, null);
    expect(result).toEqual([managedUrl]);
  });

  it("should include managed URL and custom URLs", () => {
    const customUrls = ["https://crl.example.com/ca.crl", "https://crl2.example.com/ca.crl"];
    const result = buildCrlDistributionPointUrls(managedUrl, customUrls);
    expect(result).toEqual([managedUrl, ...customUrls]);
  });

  it("should deduplicate URLs", () => {
    const customUrls = [managedUrl];
    const result = buildCrlDistributionPointUrls(managedUrl, customUrls);
    expect(result).toEqual([managedUrl]);
  });

  it("should exclude managed URL when disableManagedUrl is true", () => {
    const customUrls = ["https://crl.example.com/ca.crl"];
    const result = buildCrlDistributionPointUrls(managedUrl, customUrls, true);
    expect(result).toEqual(customUrls);
    expect(result).not.toContain(managedUrl);
  });

  it("should return empty array when disableManagedUrl is true and no custom URLs", () => {
    const result = buildCrlDistributionPointUrls(managedUrl, null, true);
    expect(result).toEqual([]);
  });

  it("should return empty array when disableManagedUrl is true and custom URLs is undefined", () => {
    const result = buildCrlDistributionPointUrls(managedUrl, undefined, true);
    expect(result).toEqual([]);
  });

  it("should include managed URL when disableManagedUrl is false", () => {
    const result = buildCrlDistributionPointUrls(managedUrl, null, false);
    expect(result).toEqual([managedUrl]);
  });

  it("should include managed URL when disableManagedUrl is undefined", () => {
    const result = buildCrlDistributionPointUrls(managedUrl, null, undefined);
    expect(result).toEqual([managedUrl]);
  });
});

describe("createDistinguishedName", () => {
  it("should build a DN with only the standard attributes", () => {
    const dn = createDistinguishedName({ commonName: "example.com", organization: "Acme" });
    expect(dn).toBe("O=Acme, CN=example.com");
  });

  it("should encode the domain component chain root first, ahead of the other attributes", () => {
    const dn = createDistinguishedName({
      commonName: "auth-AD-MANAGER02-CA",
      domainComponents: ["app", "example", "auth"]
    });
    expect(dn).toBe("DC=auth, DC=example, DC=app, CN=auth-AD-MANAGER02-CA");
  });

  it("should skip empty domain component values", () => {
    const dn = createDistinguishedName({
      commonName: "host",
      domainComponents: ["app", "", "auth"]
    });
    expect(dn).toBe("DC=auth, DC=app, CN=host");
  });

  it("should omit DC RDNs when no domain components are provided", () => {
    const dn = createDistinguishedName({ commonName: "host" });
    expect(dn).toBe("CN=host");
  });
});

describe("extractDnParts", () => {
  const parse = (dn: string) => extractDnParts(new x509.Name(dn));

  it("should read a root-first chain in display order", () => {
    expect(parse("DC=com, DC=example, DC=corp, CN=host").domainComponents).toEqual(["corp", "example", "com"]);
  });

  it("should read a chain encoded leaf first as the chain those bytes denote", () => {
    expect(parse("CN=host, DC=corp, DC=example, DC=com").domainComponents).toEqual(["com", "example", "corp"]);
  });

  it("should read a chain carrying no other attributes as root first", () => {
    expect(parse("DC=com, DC=example, DC=corp").domainComponents).toEqual(["corp", "example", "com"]);
  });

  it("should read a chain sitting before the organization attributes as root first", () => {
    expect(parse("DC=com, DC=corp, O=Acme, OU=Eng").domainComponents).toEqual(["corp", "com"]);
  });

  it("should read a single component the same either way", () => {
    expect(parse("DC=com, CN=host").domainComponents).toEqual(["com"]);
    expect(parse("CN=host, DC=com").domainComponents).toEqual(["com"]);
  });

  it("should round-trip a chain through createDistinguishedName", () => {
    const domainComponents = ["corp", "example", "com"];
    expect(parse(createDistinguishedName({ commonName: "host", domainComponents })).domainComponents).toEqual(
      domainComponents
    );
  });

  it("should leave domain components undefined when the DN carries none", () => {
    expect(parse("CN=host, O=Acme").domainComponents).toBeUndefined();
  });

  it("should read the remaining attributes alongside the chain", () => {
    const parts = parse("DC=com, DC=corp, O=Acme, OU=Eng, CN=host");
    expect(parts.commonName).toBe("host");
    expect(parts.organization).toBe("Acme");
    expect(parts.ou).toBe("Eng");
    expect(parts.domainComponents).toEqual(["corp", "com"]);
  });
});

describe("buildOcspResponderUrl", () => {
  it("should build the managed responder URL from the site URL and CA id", () => {
    expect(buildOcspResponderUrl("https://app.infisical.com", "ca-123")).toBe(
      "https://app.infisical.com/api/v1/cert-manager/ocsp/ca-123"
    );
  });
});

describe("buildAuthorityInfoAccessExtension", () => {
  const caIssuerUrl = "https://app.infisical.com/api/v1/cert-manager/ca/internal/ca-123/certificates/c-1/der";
  const ocspResponderUrl = "https://app.infisical.com/api/v1/cert-manager/ocsp/ca-123";

  it("should emit only caIssuers when no responder URL is given", () => {
    const parsed = new x509.AuthorityInfoAccessExtension(buildAuthorityInfoAccessExtension({ caIssuerUrl }).rawData);

    expect(parsed.caIssuers?.map((name) => name.value)).toEqual([caIssuerUrl]);
    expect(parsed.ocsp ?? []).toHaveLength(0);
  });

  it("should emit both accessMethods when a responder URL is given", () => {
    const parsed = new x509.AuthorityInfoAccessExtension(
      buildAuthorityInfoAccessExtension({ caIssuerUrl, ocspResponderUrl }).rawData
    );

    expect(parsed.caIssuers?.map((name) => name.value)).toEqual([caIssuerUrl]);
    expect(parsed.ocsp?.map((name) => name.value)).toEqual([ocspResponderUrl]);
  });

  it("should treat a null responder URL the same as omitting it", () => {
    const parsed = new x509.AuthorityInfoAccessExtension(
      buildAuthorityInfoAccessExtension({ caIssuerUrl, ocspResponderUrl: null }).rawData
    );

    expect(parsed.ocsp ?? []).toHaveLength(0);
  });
});

describe("buildIssuedCertificateChain", () => {
  const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };
  const PROJECT_ID = "project-1";
  const CA_ID = "ca-1";

  const generateKeys = () =>
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ]) as Promise<CryptoKeyPair>;

  const notBefore = new Date(Date.now() - 60 * 1000);
  const notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const createCaCert = async ({
    subject,
    issuer,
    publicKey,
    signingKey
  }: {
    subject: string;
    issuer: string;
    publicKey: CryptoKey;
    signingKey: CryptoKey;
  }) =>
    (
      await x509.X509CertificateGenerator.create({
        serialNumber: "01",
        subject,
        issuer,
        notBefore,
        notAfter,
        publicKey,
        signingKey,
        signingAlgorithm: SIGNING_ALGORITHM,
        extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
      })
    ).toString("pem");

  let infisicalRoot: string;
  let intermediate: string;
  let legacyRoot: string;
  let legacyIntermediate: string;
  let crossSignedRoot: string;
  let crossSignedIntermediate: string;
  let crossSignedOtherKey: string;

  beforeAll(async () => {
    const rootKeys = await generateKeys();
    const intermediateKeys = await generateKeys();
    const legacyRootKeys = await generateKeys();
    const legacyIntermediateKeys = await generateKeys();
    const otherKeys = await generateKeys();

    infisicalRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: rootKeys.publicKey,
      signingKey: rootKeys.privateKey
    });
    intermediate = await createCaCert({
      subject: "CN=Corp Issuing CA",
      issuer: "CN=Corp Root CA",
      publicKey: intermediateKeys.publicKey,
      signingKey: rootKeys.privateKey
    });
    legacyRoot = await createCaCert({
      subject: "CN=Legacy Root CA G2",
      issuer: "CN=Legacy Root CA G2",
      publicKey: legacyRootKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    legacyIntermediate = await createCaCert({
      subject: "CN=Legacy Issuing CA",
      issuer: "CN=Legacy Root CA G2",
      publicKey: legacyIntermediateKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    crossSignedRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Legacy Issuing CA",
      publicKey: rootKeys.publicKey,
      signingKey: legacyIntermediateKeys.privateKey
    });
    crossSignedIntermediate = await createCaCert({
      subject: "CN=Corp Issuing CA",
      issuer: "CN=Legacy Root CA G2",
      publicKey: intermediateKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    crossSignedOtherKey = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Legacy Root CA G2",
      publicKey: otherKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
  });

  const toCrossSignedRow = (caId: string, certificate: string, certificateChain?: string) =>
    ({
      id: `${caId}-cross-signed`,
      caId,
      encryptedCertificate: Buffer.from(certificate),
      encryptedCertificateChain: certificateChain ? Buffer.from(certificateChain) : null,
      issuer: new x509.X509Certificate(certificate).issuer,
      serialNumber: "01",
      notBefore,
      notAfter,
      createdAt: notBefore,
      updatedAt: notBefore
    }) as TCertificateAuthorityCrossSignedCerts;

  const buildChain = async ({
    caCert,
    caCertChain,
    crossSignedCerts
  }: {
    caCert: string;
    caCertChain: string;
    crossSignedCerts: TCertificateAuthorityCrossSignedCerts[];
  }) => {
    const findValidInCaHierarchy = vi.fn().mockResolvedValue(crossSignedCerts);
    const decryptWithKmsKey = vi
      .fn()
      .mockResolvedValue(async ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => Buffer.from(cipherTextBlob));

    const chain = await buildIssuedCertificateChain({
      caId: CA_ID,
      caCert,
      caCertChain,
      projectId: PROJECT_ID,
      certificateAuthorityCrossSignedCertDAL: { findValidInCaHierarchy },
      projectDAL: {
        findOne: vi.fn().mockResolvedValue({
          id: PROJECT_ID,
          orgId: "org-1",
          kmsCertificateKeyId: "kms-key-1"
        }),
        updateById: vi.fn(),
        transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(undefined))
      } as never,
      kmsService: { decryptWithKmsKey, generateKmsKey: vi.fn() } as never
    });

    return { chain, findValidInCaHierarchy, decryptWithKmsKey };
  };

  const subjectsOf = (chain: string) =>
    chain
      .split(/(?<=-----END CERTIFICATE-----)\s*/)
      .filter(Boolean)
      .map((pem) => {
        const cert = new x509.X509Certificate(pem);
        return `${cert.subject} <- ${cert.issuer}`;
      });

  it("returns the default chain without decrypting when no cross-signed certificate exists", async () => {
    const intermediateResult = await buildChain({
      caCert: intermediate,
      caCertChain: infisicalRoot,
      crossSignedCerts: []
    });
    const rootResult = await buildChain({ caCert: infisicalRoot, caCertChain: "", crossSignedCerts: [] });

    expect(intermediateResult.chain).toBe(`${intermediate}\n${infisicalRoot}`.trim());
    expect(rootResult.chain).toBe(infisicalRoot.trim());
    expect(intermediateResult.findValidInCaHierarchy).toHaveBeenCalledWith(CA_ID, expect.any(Array));
    expect(intermediateResult.decryptWithKmsKey).not.toHaveBeenCalled();
  });

  it("replaces a cross-signed intermediate and drops everything Infisical issued above it", async () => {
    const { chain } = await buildChain({
      caCert: intermediate,
      caCertChain: infisicalRoot,
      crossSignedCerts: [toCrossSignedRow("intermediate-ca", crossSignedIntermediate, legacyRoot)]
    });

    expect(subjectsOf(chain)).toEqual([
      "CN=Corp Issuing CA <- CN=Legacy Root CA G2",
      "CN=Legacy Root CA G2 <- CN=Legacy Root CA G2"
    ]);
  });

  it("uses the copy nearest the issuing CA when several CAs in the chain have one", async () => {
    const { chain } = await buildChain({
      caCert: intermediate,
      caCertChain: infisicalRoot,
      crossSignedCerts: [
        toCrossSignedRow("root-ca", crossSignedRoot, `${legacyIntermediate}\n${legacyRoot}`),
        toCrossSignedRow("intermediate-ca", crossSignedIntermediate, legacyRoot)
      ]
    });

    expect(subjectsOf(chain)).toEqual([
      "CN=Corp Issuing CA <- CN=Legacy Root CA G2",
      "CN=Legacy Root CA G2 <- CN=Legacy Root CA G2"
    ]);
  });

  it("ignores a copy with the same subject but a different key", async () => {
    const { chain } = await buildChain({
      caCert: intermediate,
      caCertChain: infisicalRoot,
      crossSignedCerts: [toCrossSignedRow("other-ca", crossSignedOtherKey, legacyRoot)]
    });

    expect(chain).toBe(`${intermediate}\n${infisicalRoot}`.trim());
  });

  it("ignores copies of CAs outside the issuing chain", async () => {
    const { chain } = await buildChain({
      caCert: infisicalRoot,
      caCertChain: "",
      crossSignedCerts: [toCrossSignedRow("intermediate-ca", crossSignedIntermediate, legacyRoot)]
    });

    expect(chain).toBe(infisicalRoot.trim());
  });
});

describe("validateCrossSignedCertificate", () => {
  const SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" };

  const generateKeys = () =>
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify"
    ]) as Promise<CryptoKeyPair>;

  const createCaCert = async ({
    subject,
    issuer,
    publicKey,
    signingKey,
    pathLength,
    keyUsages = x509.KeyUsageFlags.keyCertSign
  }: {
    subject: string;
    issuer: string;
    publicKey: CryptoKey;
    signingKey: CryptoKey;
    pathLength?: number;
    keyUsages?: number;
  }) =>
    (
      await x509.X509CertificateGenerator.create({
        serialNumber: "01",
        subject,
        issuer,
        notBefore: new Date(Date.now() - 60 * 1000),
        notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
        publicKey,
        signingKey,
        signingAlgorithm: SIGNING_ALGORITHM,
        extensions: [
          new x509.BasicConstraintsExtension(true, pathLength, true),
          new x509.KeyUsagesExtension(keyUsages, true)
        ]
      })
    ).toString("pem");

  let rootKeys: CryptoKeyPair;
  let legacyRootKeys: CryptoKeyPair;
  let legacyIntermediateKeys: CryptoKeyPair;
  let infisicalRoot: string;
  let legacyRoot: string;
  let legacyIntermediate: string;

  beforeAll(async () => {
    rootKeys = await generateKeys();
    legacyRootKeys = await generateKeys();
    legacyIntermediateKeys = await generateKeys();

    infisicalRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: rootKeys.publicKey,
      signingKey: rootKeys.privateKey
    });
    legacyRoot = await createCaCert({
      subject: "CN=Legacy Root CA",
      issuer: "CN=Legacy Root CA",
      publicKey: legacyRootKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
    legacyIntermediate = await createCaCert({
      subject: "CN=Legacy Issuing CA",
      issuer: "CN=Legacy Root CA",
      publicKey: legacyIntermediateKeys.publicKey,
      signingKey: legacyRootKeys.privateKey
    });
  });

  const crossSignRoot = (
    signingKey: CryptoKey,
    issuer: string,
    options: { pathLength?: number; keyUsages?: number } = {}
  ) =>
    createCaCert({
      subject: "CN=Corp Root CA",
      issuer,
      publicKey: rootKeys.publicKey,
      signingKey,
      ...options
    });

  it("accepts a copy signed by an old root that has the same name as the CA", async () => {
    const sameNameLegacyKeys = await generateKeys();
    const sameNameLegacyRoot = await createCaCert({
      subject: "CN=Corp Root CA",
      issuer: "CN=Corp Root CA",
      publicKey: sameNameLegacyKeys.publicKey,
      signingKey: sameNameLegacyKeys.privateKey
    });
    const crossSigned = await crossSignRoot(sameNameLegacyKeys.privateKey, "CN=Corp Root CA");

    const { crossSignedCertObj } = await validateCrossSignedCertificate({
      caCertificate: infisicalRoot,
      caCertificateChain: "",
      certificate: crossSigned,
      certificateChain: sameNameLegacyRoot
    });

    expect(crossSignedCertObj.issuer).toBe("CN=Corp Root CA");
  });

  it("rejects the CA's own self-signed certificate", async () => {
    await expect(
      validateCrossSignedCertificate({
        caCertificate: infisicalRoot,
        caCertificateChain: "",
        certificate: infisicalRoot
      })
    ).rejects.toThrow("self-signed");
  });

  it("rejects a copy with a shorter path length than the CA", async () => {
    const crossSigned = await crossSignRoot(legacyRootKeys.privateKey, "CN=Legacy Root CA", { pathLength: 0 });

    await expect(
      validateCrossSignedCertificate({
        caCertificate: infisicalRoot,
        caCertificateChain: "",
        certificate: crossSigned
      })
    ).rejects.toThrow("fewer CA levels");
  });

  it("rejects a copy that can't sign certificates", async () => {
    const crossSigned = await crossSignRoot(legacyRootKeys.privateKey, "CN=Legacy Root CA", {
      keyUsages: x509.KeyUsageFlags.digitalSignature
    });

    await expect(
      validateCrossSignedCertificate({
        caCertificate: infisicalRoot,
        caCertificateChain: "",
        certificate: crossSigned
      })
    ).rejects.toThrow("can't sign certificates");
  });

  it("rejects a chain whose upper certificate didn't sign the one below it", async () => {
    const otherRootKeys = await generateKeys();
    const otherRoot = await createCaCert({
      subject: "CN=Legacy Root CA",
      issuer: "CN=Legacy Root CA",
      publicKey: otherRootKeys.publicKey,
      signingKey: otherRootKeys.privateKey
    });
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    await expect(
      validateCrossSignedCertificate({
        caCertificate: infisicalRoot,
        caCertificateChain: "",
        certificate: crossSigned,
        certificateChain: `${legacyIntermediate}\n${otherRoot}`
      })
    ).rejects.toThrow("Certificate 2 in the chain didn't sign certificate 1");
  });

  it("accepts a copy with a complete, ordered chain", async () => {
    const crossSigned = await crossSignRoot(legacyIntermediateKeys.privateKey, "CN=Legacy Issuing CA");

    const { crossSignedCertChainPem } = await validateCrossSignedCertificate({
      caCertificate: infisicalRoot,
      caCertificateChain: "",
      certificate: crossSigned,
      certificateChain: `${legacyIntermediate}\n${legacyRoot}`
    });

    expect(crossSignedCertChainPem).toContain("BEGIN CERTIFICATE");
  });
});
