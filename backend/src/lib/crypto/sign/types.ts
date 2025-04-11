import { z } from "zod";

export type TAsymmetricSignVerifyFns = {
  sign: (data: Buffer, key: Buffer, signingAlgorithm: SigningAlgorithm, isDigest: boolean) => Promise<Buffer>;
  verify: (
    data: Buffer,
    signature: Buffer,
    key: Buffer,
    signingAlgorithm: SigningAlgorithm,
    isDigest: boolean
  ) => Promise<boolean>;
  generateAsymmetricPrivateKey: () => Promise<Buffer>;
  getPublicKeyFromPrivateKey: (privateKey: Buffer) => Buffer;
};

// Supported asymmetric key types
export enum AsymmetricKeyAlgorithm {
  RSA_4096 = "RSA_4096",
  ECC_NIST_P256 = "ECC_NIST_P256"
}

export const AsymmetricKeyAlgorithmEnum = z.enum(
  Object.values(AsymmetricKeyAlgorithm) as [string, ...string[]]
).options;

export enum SigningAlgorithm {
  // RSA PSS algorithms
  // These are NOT deterministic and include randomness.
  // This means that the output signature is different each time for the same input.
  RSASSA_PSS_SHA_512 = "RSASSA_PSS_SHA_512",
  RSASSA_PSS_SHA_384 = "RSASSA_PSS_SHA_384",
  RSASSA_PSS_SHA_256 = "RSASSA_PSS_SHA_256",

  // RSA PKCS#1 v1.5 algorithms
  // These are deterministic and the output is the same each time for the same input.
  RSASSA_PKCS1_V1_5_SHA_512 = "RSASSA_PKCS1_V1_5_SHA_512",
  RSASSA_PKCS1_V1_5_SHA_384 = "RSASSA_PKCS1_V1_5_SHA_384",
  RSASSA_PKCS1_V1_5_SHA_256 = "RSASSA_PKCS1_V1_5_SHA_256",

  // ECDSA algorithms
  // None of these are deterministic and include randomness like RSA PSS.
  ECDSA_SHA_512 = "ECDSA_SHA_512",
  ECDSA_SHA_384 = "ECDSA_SHA_384",
  ECDSA_SHA_256 = "ECDSA_SHA_256"
}
