import crypto, { webcrypto } from "node:crypto";

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
const importBlindIndexKey = (blindIndexKey: Buffer) =>
  crypto.subtle.importKey("raw", blindIndexKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);

const signBlindIndex = async (secretValue: Buffer, cryptoKey: webcrypto.CryptoKey): Promise<string> => {
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, secretValue);

  return Buffer.from(signature).toString("hex");
};

export const generateSecretValueBlindIndex = async (secretValue: Buffer, blindIndexKey: Buffer): Promise<string> =>
  signBlindIndex(secretValue, await importBlindIndexKey(blindIndexKey));

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

// Derives and imports the key once, on first use, then reuses it for every value hashed under the same
// data key. A backfill or a bulk write hashes thousands of values per key, and redoing the HKDF and the
// import for each one adds threadpool work that changes nothing in the output. Lazy, because most
// callers of a cipher pair never hash anything.
export const createSecretValueBlindIndexer = (kmsDataKey: Buffer) => {
  let cryptoKey: Promise<webcrypto.CryptoKey> | undefined;

  const getCryptoKey = () => {
    if (!cryptoKey) {
      cryptoKey = deriveSecretValueBlindIndexKey(kmsDataKey).then(importBlindIndexKey);
      // A failed derivation is not cached, so the next value tries again rather than inheriting it.
      cryptoKey.catch(() => {
        cryptoKey = undefined;
      });
    }
    return cryptoKey;
  };

  return async (secretValue: Buffer): Promise<string> => signBlindIndex(secretValue, await getCryptoKey());
};
