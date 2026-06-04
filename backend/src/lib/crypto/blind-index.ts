import crypto from "node:crypto";

const BLIND_INDEX_CONTEXT = "infisical-secret-value-blind-index-v1";

/**
 * Derives a blind index key from the KMS data key using HKDF.
 * The context string ensures domain separation — the derived key
 * can only be used for blind indexing, not for encryption/decryption.
 */
export const deriveSecretValueBlindIndexKey = async (kmsDataKey: Buffer): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    crypto.hkdf(
      "sha256",
      kmsDataKey,
      Buffer.alloc(0), // salt (empty is acceptable for key derivation from high-entropy input)
      Buffer.from(BLIND_INDEX_CONTEXT),
      32, // 256-bit output key
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(Buffer.from(derivedKey));
      }
    );
  });
};

/**
 * Generates a blind index for a secret value using HMAC-SHA256.
 * Uses Web Crypto API for async, non-blocking operation.
 */
export const generateSecretValueBlindIndex = async (secretValue: Buffer, blindIndexKey: Buffer): Promise<string> => {
  const cryptoKey = await crypto.subtle.importKey("raw", blindIndexKey, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, secretValue);

  return Buffer.from(signature).toString("hex");
};

/**
 * Convenience wrapper that derives the blind index key from KMS data key
 * and generates the blind index in one call.
 */
export const generateSecretValueBlindIndexFromKmsKey = async (
  secretValue: Buffer,
  kmsDataKey: Buffer
): Promise<string> => {
  const blindIndexKey = await deriveSecretValueBlindIndexKey(kmsDataKey);
  return generateSecretValueBlindIndex(secretValue, blindIndexKey);
};
