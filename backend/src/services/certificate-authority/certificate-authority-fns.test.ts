import { webcrypto } from "node:crypto";

import { AsnConvert } from "@peculiar/asn1-schema";
import { CRLNumber, id_ce_cRLNumber } from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { TCertificateAuthorityCrossSignedCerts } from "@app/db/schemas";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { BadRequestError } from "@app/lib/errors";
import { ExecutionError, ResourceLockedError } from "@app/lib/red-lock";
import { CertKeyAlgorithm, CertStatus } from "@app/services/certificate/certificate-types";
import { CertKeySource } from "@app/services/signer/signer-enums";

import { buildExternalCaSigner, buildLocalCaSigner } from "./ca-signer";
import {
  buildAuthorityInfoAccessExtension,
  buildCaCrlParams,
  buildCrlDistributionPointUrls,
  buildIssuedCertificateChain,
  buildOcspResponderUrl,
  createDistinguishedName,
  extractDnParts,
  rebuildCaCrl,
  rebuildCaCrlAfterChange,
  signatureAlgorithmToAlgCfg
} from "./certificate-authority-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

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

const EC_SIGNING_ALGORITHM = { name: "ECDSA", hash: "SHA-256" } as Algorithm;
const EC_KEY_PARAMS = { name: "ECDSA", namedCurve: "P-256" };
const DAY_MS = 24 * 60 * 60 * 1000;
const CA_DN = "CN=CRL Test CA";

const generateCaKeys = () =>
  webcrypto.subtle.generateKey(EC_KEY_PARAMS, true, ["sign", "verify"]) as Promise<CryptoKeyPair>;

const readCrlNumber = (crl: x509.X509Crl) => {
  const extension = crl.extensions.find((ext) => ext.type === id_ce_cRLNumber);
  return extension ? AsnConvert.parse(extension.value, CRLNumber).value : undefined;
};

const readAuthorityKeyId = (crl: x509.X509Crl) => crl.getExtension(x509.AuthorityKeyIdentifierExtension)?.keyId;

const subjectKeyIdOf = async (publicKey: CryptoKey) =>
  (await x509.SubjectKeyIdentifierExtension.create(publicKey)).keyId;

describe("buildCaCrlParams", () => {
  let caKeys: CryptoKeyPair;

  beforeAll(async () => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
    caKeys = await generateCaKeys();
  });

  const build = (overrides: Partial<Parameters<typeof buildCaCrlParams>[0]> = {}) =>
    buildCaCrlParams({
      issuer: CA_DN,
      caPublicKey: caKeys.publicKey,
      crlNumber: 1,
      crlValidityDays: 30,
      entries: [],
      ...overrides
    });

  it("should set nextUpdate the configured number of days after thisUpdate", async () => {
    const params = await build({ crlValidityDays: 30 });
    expect(params.nextUpdate.getTime() - params.thisUpdate.getTime()).toBeGreaterThanOrEqual(
      30 * DAY_MS - 60 * 60 * 1000
    );
    expect(params.nextUpdate.getTime() - params.thisUpdate.getTime()).toBeLessThanOrEqual(30 * DAY_MS + 60 * 60 * 1000);
  });

  it("should cap nextUpdate at the CA certificate's notAfter", async () => {
    const caNotAfter = new Date(Date.now() + 5 * DAY_MS);
    const params = await build({ crlValidityDays: 30, caNotAfter });
    expect(params.nextUpdate).toEqual(caNotAfter);
  });

  it("should refuse to sign a CRL for a CA whose certificate has expired", async () => {
    await expect(build({ caNotAfter: new Date(Date.now() - DAY_MS) })).rejects.toBeInstanceOf(BadRequestError);
  });

  it("should keep the full validity when the CA outlives it", async () => {
    const caNotAfter = new Date(Date.now() + 365 * DAY_MS);
    const params = await build({ crlValidityDays: 1, caNotAfter });
    expect(params.nextUpdate.getTime()).toBeLessThan(caNotAfter.getTime());
    expect(params.nextUpdate.getTime() - params.thisUpdate.getTime()).toBeLessThanOrEqual(DAY_MS + 60 * 60 * 1000);
  });

  it("should sign the CRL number and an authority key identifier matching the CA's subject key identifier", async () => {
    const signer = buildLocalCaSigner({ ...caKeys, signingAlgorithm: EC_SIGNING_ALGORITHM });
    const crl = await signer.createCrl(await build({ crlNumber: 42 }));

    expect(readCrlNumber(crl)).toBe(42);
    expect(readAuthorityKeyId(crl)).toBe(await subjectKeyIdOf(caKeys.publicKey));
    expect(await crl.verify({ publicKey: caKeys.publicKey })).toBe(true);
  });

  it("should carry both extensions through an external key signer, whose structure is built with a throwaway key", async () => {
    const signer = buildExternalCaSigner({
      caPublicKey: caKeys.publicKey,
      signingAlgorithm: EC_SIGNING_ALGORITHM,
      generateEphemeralKey: generateCaKeys,
      signTbs: buildLocalCaSigner({ ...caKeys, signingAlgorithm: EC_SIGNING_ALGORITHM }).signTbs
    });
    const crl = await signer.createCrl(await build({ crlNumber: 7 }));

    expect(readCrlNumber(crl)).toBe(7);
    expect(readAuthorityKeyId(crl)).toBe(await subjectKeyIdOf(caKeys.publicKey));
    expect(await crl.verify({ publicKey: caKeys.publicKey })).toBe(true);
  });
});

describe("rebuildCaCrl", () => {
  const CA_ID = "ca-1";
  const REVOKED_SERIAL = "0a1b2c";

  beforeAll(() => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);
  });

  const PRIMARY = { node: "primary" };

  const buildRebuildDeps = async ({
    storedCrlNumber = 41,
    isSigningBroken = false,
    isLockBusy = false,
    isRedisDown = false,
    conflictingWrites = 0
  } = {}) => {
    const calls: string[] = [];
    const caKeys = await generateCaKeys();
    const signer = buildLocalCaSigner({ ...caKeys, signingAlgorithm: EC_SIGNING_ALGORITHM });
    let currentCrlNumber = storedCrlNumber;
    let conflictsLeft = conflictingWrites;
    const certificateAuthorityCrlDAL = {
      primaryNode: vi.fn(() => PRIMARY),
      findOne: vi.fn(async () => {
        calls.push("readCrl");
        return { id: "crl-1", crlNumber: String(currentCrlNumber) };
      }),
      update: vi.fn(async () => {
        if (conflictsLeft > 0) {
          conflictsLeft -= 1;
          currentCrlNumber += 1;
          return [];
        }
        return [{ id: "crl-1" }];
      })
    };
    const keyStore = {
      acquireLock: vi.fn(async () => {
        if (isLockBusy || isRedisDown) {
          const vote = isLockBusy
            ? new ResourceLockedError("The resource is locked.")
            : new Error("connect ECONNREFUSED");
          throw new ExecutionError("The operation was unable to achieve a quorum during its retry window.", [
            Promise.resolve({
              membershipSize: 1,
              quorumSize: 1,
              votesFor: new Set(),
              votesAgainst: new Map([[{}, vote]])
            } as never)
          ]);
        }
        calls.push("lock");
        return {
          release: vi.fn(async () => {
            calls.push("release");
          })
        };
      })
    };

    const deps = {
      caId: CA_ID,
      keyStore,
      certificateAuthorityCrlDAL,
      certificateAuthorityDAL: {
        findByIdWithAssociatedCa: vi.fn(async () => ({
          id: CA_ID,
          projectId: "project-1",
          internalCa: { id: "internal-1", dn: CA_DN, keyAlgorithm: CertKeyAlgorithm.ECDSA_P256, crlValidityDays: 30 }
        }))
      },
      certificateAuthoritySecretDAL: { findOne: vi.fn(async () => ({ id: "secret-1", keySource: CertKeySource.Hsm })) },
      caKeySourceService: {
        buildSigner: vi.fn(async () =>
          isSigningBroken
            ? {
                ...signer,
                createCrl: async () => {
                  throw new Error("HSM unavailable");
                }
              }
            : signer
        )
      },
      projectDAL: {
        transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})),
        findOne: vi.fn(async () => ({ id: "project-1", orgId: "org-1", kmsCertificateKeyId: "kms-1" })),
        updateById: vi.fn()
      },
      kmsService: {
        encryptWithKmsKey: vi.fn(async () => async ({ plainText }: { plainText: Buffer }) => ({
          cipherTextBlob: plainText
        })),
        decryptWithKmsKey: vi.fn(),
        generateKmsKey: vi.fn()
      },
      certificateDAL: {
        find: vi.fn(async () => [
          { serialNumber: REVOKED_SERIAL, status: CertStatus.REVOKED, revokedAt: new Date(), revocationReason: 1 }
        ])
      }
    };

    return {
      deps: deps as unknown as Parameters<typeof rebuildCaCrl>[0],
      calls,
      certificateAuthorityCrlDAL,
      certificateDAL: deps.certificateDAL,
      keyStore
    };
  };

  it("should sign the next CRL number after the stored one and store exactly what it signed", async () => {
    const { deps, certificateAuthorityCrlDAL } = await buildRebuildDeps({ storedCrlNumber: 41 });

    const result = await rebuildCaCrl(deps);

    const [filter, stored] = certificateAuthorityCrlDAL.update.mock.calls[0] as unknown as [
      { id: string; crlNumber: string },
      { encryptedCrl: Buffer; thisUpdate: Date; nextUpdate: Date; crlNumber: number }
    ];
    const signed = new x509.X509Crl(new Uint8Array(stored.encryptedCrl));

    expect(filter).toEqual({ id: "crl-1", crlNumber: "41" });
    expect(result.crlNumber).toBe(42);
    expect(stored.crlNumber).toBe(42);
    expect(readCrlNumber(signed)).toBe(42);
    expect(Math.floor(stored.nextUpdate.getTime() / 1000)).toBe((signed.nextUpdate as Date).getTime() / 1000);
    expect(stored.nextUpdate.getTime() - stored.thisUpdate.getTime()).toBeGreaterThan(29 * DAY_MS);
    expect(signed.entries.map((entry) => entry.serialNumber)).toEqual([REVOKED_SERIAL]);
  });

  it("should read the stored CRL number only while holding the CA's lock", async () => {
    const { deps, calls, keyStore } = await buildRebuildDeps();

    await rebuildCaCrl(deps);

    expect((keyStore.acquireLock.mock.calls[0] as unknown[])[0]).toEqual([KeyStorePrefixes.CaCrlRebuildLock(CA_ID)]);
    expect(calls).toEqual(["lock", "readCrl", "release"]);
  });

  it("should release the lock and store nothing when signing fails", async () => {
    const { deps, calls, certificateAuthorityCrlDAL } = await buildRebuildDeps({ isSigningBroken: true });

    await expect(rebuildCaCrl(deps)).rejects.toThrow();

    expect(certificateAuthorityCrlDAL.update).not.toHaveBeenCalled();
    expect(calls[calls.length - 1]).toBe("release");
  });

  it("should read the revoked certificates from the primary", async () => {
    const { deps, certificateDAL } = await buildRebuildDeps();

    await rebuildCaCrl(deps);

    expect(certificateDAL.find).toHaveBeenCalledWith({ caId: CA_ID, status: CertStatus.REVOKED }, { tx: PRIMARY });
  });

  it("should refuse instead of overwriting a CRL another writer stored meanwhile", async () => {
    const { deps, calls, certificateAuthorityCrlDAL } = await buildRebuildDeps({ conflictingWrites: 1 });

    await expect(rebuildCaCrl(deps)).rejects.toBeInstanceOf(BadRequestError);
    expect(certificateAuthorityCrlDAL.update).toHaveBeenCalledTimes(1);
    expect(calls[calls.length - 1]).toBe("release");
  });

  it("should answer with a readable error when the CA's lock cannot be taken", async () => {
    const { deps, certificateAuthorityCrlDAL } = await buildRebuildDeps({ isLockBusy: true });

    await expect(rebuildCaCrl(deps)).rejects.toThrow("Another CRL update for this CA is still in progress.");
    expect(certificateAuthorityCrlDAL.findOne).not.toHaveBeenCalled();
  });

  it("should not report a lock store failure as another update in progress", async () => {
    const { deps } = await buildRebuildDeps({ isRedisDown: true });

    await expect(rebuildCaCrl(deps)).rejects.toBeInstanceOf(ExecutionError);
  });

  it("should log and continue when a rebuild after a CA change fails", async () => {
    const { deps, certificateAuthorityCrlDAL } = await buildRebuildDeps({ isSigningBroken: true });

    await expect(rebuildCaCrlAfterChange(deps)).resolves.toBeUndefined();
    expect(certificateAuthorityCrlDAL.update).not.toHaveBeenCalled();
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

  const toCrossSignedRow = (caId: string, certificate: string, certificateChain: string) =>
    ({
      id: `${caId}-cross-signed`,
      caId,
      encryptedCertificate: Buffer.from(certificate),
      encryptedCertificateChain: Buffer.from(certificateChain),
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
