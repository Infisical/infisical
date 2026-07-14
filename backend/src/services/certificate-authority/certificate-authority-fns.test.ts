import { describe, expect, it } from "vitest";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import {
  buildCrlDistributionPointUrls,
  createDistinguishedName,
  signatureAlgorithmToAlgCfg
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

  it("should emit one DC RDN per domain component, in the given order, after the CN", () => {
    const dn = createDistinguishedName({
      commonName: "auth-AD-MANAGER02-CA",
      domainComponents: ["app", "lucidgov", "auth"]
    });
    expect(dn).toBe("CN=auth-AD-MANAGER02-CA, DC=app, DC=lucidgov, DC=auth");
  });

  it("should skip empty domain component values", () => {
    const dn = createDistinguishedName({
      commonName: "host",
      domainComponents: ["app", "", "auth"]
    });
    expect(dn).toBe("CN=host, DC=app, DC=auth");
  });

  it("should omit DC RDNs when no domain components are provided", () => {
    const dn = createDistinguishedName({ commonName: "host" });
    expect(dn).toBe("CN=host");
  });
});
