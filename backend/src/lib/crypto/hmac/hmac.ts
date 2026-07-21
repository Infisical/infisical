import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";

import { HmacAlgorithm, THmacFns } from "./types";

const HMAC_ALGORITHM_CONFIG: Record<HmacAlgorithm, { hash: string; keyByteLength: number }> = {
  [HmacAlgorithm.HMAC_SHA_1]: { hash: "sha1", keyByteLength: 20 },
  [HmacAlgorithm.HMAC_SHA_224]: { hash: "sha224", keyByteLength: 28 },
  [HmacAlgorithm.HMAC_SHA_256]: { hash: "sha256", keyByteLength: 32 },
  [HmacAlgorithm.HMAC_SHA_384]: { hash: "sha384", keyByteLength: 48 },
  [HmacAlgorithm.HMAC_SHA_512]: { hash: "sha512", keyByteLength: 64 }
};

export const getHmacAlgorithmConfig = (algorithm: HmacAlgorithm) => {
  const config = HMAC_ALGORITHM_CONFIG[algorithm];
  if (!config) {
    throw new BadRequestError({ message: `Unsupported HMAC algorithm: ${algorithm as string}` });
  }
  return config;
};

/**
 * Service for HMAC (RFC 2104) message authentication code generation and verification.
 *
 * @param algorithm The HMAC algorithm, which also determines the hash function and generated key length.
 * @returns Object with generateMac, verifyMac, generateKeyMaterial and getKeyByteLength functions.
 */
export const hmacService = (algorithm: HmacAlgorithm): THmacFns => {
  const { hash, keyByteLength } = getHmacAlgorithmConfig(algorithm);

  const generateMac = (data: Buffer, key: Buffer) => crypto.nativeCrypto.createHmac(hash, key).update(data).digest();

  const verifyMac = (data: Buffer, mac: Buffer, key: Buffer) => {
    const expected = crypto.nativeCrypto.createHmac(hash, key).update(data).digest();
    if (expected.length !== mac.length) {
      return false;
    }
    return crypto.nativeCrypto.timingSafeEqual(expected, mac);
  };

  const generateKeyMaterial = () => crypto.randomBytes(keyByteLength);

  const getKeyByteLength = () => keyByteLength;

  return { generateMac, verifyMac, generateKeyMaterial, getKeyByteLength };
};
