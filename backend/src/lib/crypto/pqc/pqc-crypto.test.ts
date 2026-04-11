import { beforeAll, describe, expect, it } from "vitest";

import { createPqcCrypto, isPqcCryptoKey, PqcCryptoKey } from "./pqc-crypto";
import { verifyPqcOpenSSLAvailability } from "./pqc-openssl";

// These tests require the PQC OpenSSL 3.5+ binary
describe("ML-DSA PQC Crypto Provider", () => {
  let pqcCrypto: Crypto;
  let pqcAvailable = false;

  beforeAll(async () => {
    pqcAvailable = await verifyPqcOpenSSLAvailability();
    if (pqcAvailable) {
      pqcCrypto = createPqcCrypto();
    }
  });

  describe.each(["ML-DSA-44", "ML-DSA-65", "ML-DSA-87"])("%s", (algName) => {
    it("should generate a key pair", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      expect(keys.privateKey).toBeDefined();
      expect(keys.publicKey).toBeDefined();
      expect(isPqcCryptoKey(keys.privateKey)).toBe(true);
      expect(isPqcCryptoKey(keys.publicKey)).toBe(true);
      expect(keys.privateKey.type).toBe("private");
      expect(keys.publicKey.type).toBe("public");
      expect(keys.privateKey.algorithm.name).toBe(algName);
      expect(keys.publicKey.algorithm.name).toBe(algName);
    });

    it("should sign and verify", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      const message = new TextEncoder().encode("Hello, post-quantum world!");
      const signature = await pqcCrypto.subtle.sign({ name: algName }, keys.privateKey, message);

      expect(signature).toBeInstanceOf(ArrayBuffer);
      expect(signature.byteLength).toBeGreaterThan(0);

      const isValid = await pqcCrypto.subtle.verify({ name: algName }, keys.publicKey, signature, message);
      expect(isValid).toBe(true);
    });

    it("should fail verification with wrong message", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      const message = new TextEncoder().encode("Original message");
      const signature = await pqcCrypto.subtle.sign({ name: algName }, keys.privateKey, message);

      const wrongMessage = new TextEncoder().encode("Tampered message");
      const isValid = await pqcCrypto.subtle.verify({ name: algName }, keys.publicKey, signature, wrongMessage);
      expect(isValid).toBe(false);
    });

    it("should export and import private key via PKCS#8 DER roundtrip", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      // Export private key as PKCS#8 DER
      const pkcs8Der = await pqcCrypto.subtle.exportKey("pkcs8", keys.privateKey);
      expect(pkcs8Der).toBeInstanceOf(ArrayBuffer);
      expect(pkcs8Der.byteLength).toBeGreaterThan(0);

      // Import it back
      const importedKey = await pqcCrypto.subtle.importKey("pkcs8", pkcs8Der, { name: algName }, true, ["sign"]);
      expect(isPqcCryptoKey(importedKey)).toBe(true);
      expect(importedKey.type).toBe("private");

      // Sign with imported key and verify with original public key
      const message = new TextEncoder().encode("Roundtrip test");
      const signature = await pqcCrypto.subtle.sign({ name: algName }, importedKey, message);
      const isValid = await pqcCrypto.subtle.verify({ name: algName }, keys.publicKey, signature, message);
      expect(isValid).toBe(true);
    });

    it("should export and import public key via SPKI DER roundtrip", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      // Export public key as SPKI DER
      const spkiDer = await pqcCrypto.subtle.exportKey("spki", keys.publicKey);
      expect(spkiDer).toBeInstanceOf(ArrayBuffer);
      expect(spkiDer.byteLength).toBeGreaterThan(0);

      // Import it back
      const importedPubKey = await pqcCrypto.subtle.importKey("spki", spkiDer, { name: algName }, true, ["verify"]);
      expect(isPqcCryptoKey(importedPubKey)).toBe(true);
      expect(importedPubKey.type).toBe("public");

      // Sign with original private key and verify with imported public key
      const message = new TextEncoder().encode("SPKI roundtrip test");
      const signature = await pqcCrypto.subtle.sign({ name: algName }, keys.privateKey, message);
      const isValid = await pqcCrypto.subtle.verify({ name: algName }, importedPubKey, signature, message);
      expect(isValid).toBe(true);
    });

    it("should produce correct key sizes", async ({ skip }) => {
      if (!pqcAvailable) skip();
      const keys = (await pqcCrypto.subtle.generateKey({ name: algName }, true, ["sign", "verify"])) as CryptoKeyPair;

      const privKey = keys.privateKey as PqcCryptoKey;
      const pubKey = keys.publicKey as PqcCryptoKey;

      const expectedSizes: Record<string, { secret: number; public: number }> = {
        "ML-DSA-44": { secret: 2560, public: 1312 },
        "ML-DSA-65": { secret: 4032, public: 1952 },
        "ML-DSA-87": { secret: 4896, public: 2592 }
      };

      expect(privKey.rawKey.length).toBe(expectedSizes[algName].secret);
      expect(pubKey.rawKey.length).toBe(expectedSizes[algName].public);
    });
  });

  it("should delegate classical algorithms to default subtle", async () => {
    // RSA key generation should still work through the provider
    const crypto = createPqcCrypto();
    const keys = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256"
      },
      true,
      ["sign", "verify"]
    );

    expect(keys.privateKey).toBeDefined();
    expect(keys.publicKey).toBeDefined();
    // Should NOT be ML-DSA keys
    expect(isPqcCryptoKey(keys.privateKey)).toBe(false);
    expect(isPqcCryptoKey(keys.publicKey)).toBe(false);
  });
});
