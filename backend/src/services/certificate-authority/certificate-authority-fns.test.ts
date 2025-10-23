import { describe, expect, it } from "vitest";

import { CertKeyAlgorithm } from "@app/services/certificate/certificate-types";

import { signatureAlgorithmToAlgCfg } from "./certificate-authority-fns";

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
      expect(result.hash).toBe("SHA-256");
    });

    it("should normalize SHA384 to SHA-384", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA384", CertKeyAlgorithm.ECDSA_P384);
      expect(result.hash).toBe("SHA-384");
    });

    it("should normalize SHA512 to SHA-512", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA512", CertKeyAlgorithm.RSA_4096);
      expect(result.hash).toBe("SHA-512");
    });

    it("should handle SHA1 format", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA1", CertKeyAlgorithm.RSA_2048);
      expect(result.hash).toBe("SHA-1");
    });

    it("should handle SHA224 format", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA224", CertKeyAlgorithm.ECDSA_P256);
      expect(result.hash).toBe("SHA-224");
    });

    it("should handle case insensitive hash normalization", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-sha256", CertKeyAlgorithm.RSA_2048);
      expect(result.hash).toBe("SHA-256");
    });

    it("should handle already normalized hash formats", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", CertKeyAlgorithm.ECDSA_P256);
      expect(result.hash).toBe("SHA-256");
    });

    it("should handle SHA-3 family hashes", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA3256", CertKeyAlgorithm.RSA_2048);
      expect(result.hash).toBe("SHA3-256");
    });
  });

  describe("dynamic key algorithm support", () => {
    it("should support future RSA key sizes", () => {
      const result = signatureAlgorithmToAlgCfg("RSA-SHA256", "RSA_8192");

      expect(result.name).toBe("RSASSA-PKCS1-v1_5");
      expect(result.hash).toBe("SHA-256");
    });

    it("should support future EC curves", () => {
      const result = signatureAlgorithmToAlgCfg("ECDSA-SHA256", "EC_secp521r1");

      expect(result.name).toBe("ECDSA");
      expect(result.namedCurve).toBe("P-521");
      expect(result.hash).toBe("SHA-256");
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
});
