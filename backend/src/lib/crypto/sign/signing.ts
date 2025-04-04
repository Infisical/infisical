import crypto from "crypto";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { AsymmetricKeyAlgorithm, SigningAlgorithm, TAsymmetricSignVerifyFns } from "./types";

// Map of signing algorithms to their parameters
interface SigningParams {
  hashAlgorithm: string;
  padding?: number; // Will use crypto.constants values
  saltLength?: number;
}

const SHA256_DIGEST_LENGTH = 32;
const SHA384_DIGEST_LENGTH = 48;
const SHA512_DIGEST_LENGTH = 64;

/**
 * Service for cryptographic signing and verification operations using asymmetric keys
 *
 * @param algorithm The signing algorithm to use
 * @returns Object with sign and verify functions
 */
export const signingService = (algorithm: AsymmetricKeyAlgorithm): TAsymmetricSignVerifyFns => {
  const $getSigningParams = (signingAlgorithm: SigningAlgorithm): SigningParams => {
    switch (signingAlgorithm) {
      // RSA PSS
      case SigningAlgorithm.RSASSA_PSS_SHA_256:
        return {
          hashAlgorithm: "sha256",
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA256_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_384:
        return {
          hashAlgorithm: "sha384",
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA384_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_512:
        return {
          hashAlgorithm: "sha512",
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA512_DIGEST_LENGTH
        };

      // RSA PKCS#1 v1.5
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256:
        return {
          hashAlgorithm: "sha256",
          padding: crypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384:
        return {
          hashAlgorithm: "sha384",
          padding: crypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512:
        return {
          hashAlgorithm: "sha512",
          padding: crypto.constants.RSA_PKCS1_PADDING
        };

      // ECDSA
      case SigningAlgorithm.ECDSA_SHA_256:
        return { hashAlgorithm: "sha256" };
      case SigningAlgorithm.ECDSA_SHA_384:
        return { hashAlgorithm: "sha384" };
      case SigningAlgorithm.ECDSA_SHA_512:
        return { hashAlgorithm: "sha512" };

      default:
        throw new Error(`Unsupported signing algorithm: ${signingAlgorithm as string}`);
    }
  };

  // For ECC key generation, nodejs has some strange and hardly documented curve naming conventions
  const $getEcCurveName = (keyAlgorithm: AsymmetricKeyAlgorithm): string => {
    // We will support more in the future
    switch (keyAlgorithm) {
      case AsymmetricKeyAlgorithm.ECC_NIST_P256:
        return "prime256v1";
      default:
        throw new Error(`Unsupported EC curve: ${keyAlgorithm}`);
    }
  };

  const $validateAlgorithmWithKeyType = (signingAlgorithm: SigningAlgorithm) => {
    const isRsaKey = algorithm.startsWith("rsa");
    const isEccKey = algorithm.startsWith("ecc");

    const isRsaAlgorithm = signingAlgorithm.startsWith("RSASSA");
    const isEccAlgorithm = signingAlgorithm.startsWith("ECDSA");

    if (isRsaKey && !isRsaAlgorithm) {
      throw new BadRequestError({ message: `KMS RSA key cannot be used with ${signingAlgorithm}` });
    }

    if (isEccKey && !isEccAlgorithm) {
      throw new BadRequestError({ message: `KMS ECC key cannot be used with ${signingAlgorithm}` });
    }
  };

  const generateAsymmetricPrivateKey = async () => {
    const { privateKey } = await new Promise<{ privateKey: string }>((resolve, reject) => {
      if (algorithm.startsWith("rsa")) {
        crypto.generateKeyPair(
          "rsa",
          {
            modulusLength: Number(algorithm.split("-")[1]),
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" }
          },
          (err, _, pk) => {
            if (err) {
              reject(err);
            } else {
              resolve({ privateKey: pk });
            }
          }
        );
      } else {
        const namedCurve = $getEcCurveName(algorithm);

        crypto.generateKeyPair(
          "ec",
          {
            namedCurve,
            publicKeyEncoding: { type: "spki", format: "pem" },
            privateKeyEncoding: { type: "pkcs8", format: "pem" }
          },
          (err, _, pk) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                privateKey: pk
              });
            }
          }
        );
      }
    });

    return Buffer.from(privateKey);
  };

  const getPublicKeyFromPrivateKey = (privateKey: Buffer) => {
    if (algorithm.startsWith("rsa")) {
      // For RSA keys in PEM format
      const privateKeyObj = crypto.createPrivateKey({
        key: privateKey,
        format: "pem",
        type: "pkcs8"
      });

      const publicKey = crypto.createPublicKey(privateKeyObj).export({
        type: "spki",
        format: "pem"
      });

      if (Buffer.isBuffer(publicKey)) {
        return publicKey;
      }
      return Buffer.from(publicKey);
    }

    const privateKeyObj = crypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    const publicKey = crypto.createPublicKey(privateKeyObj).export({
      type: "spki",
      format: "pem"
    });

    if (Buffer.isBuffer(publicKey)) {
      return publicKey;
    }
    return Buffer.from(publicKey);
  };

  const sign = (data: Buffer, privateKey: Buffer, signingAlgorithm: SigningAlgorithm): Buffer => {
    $validateAlgorithmWithKeyType(signingAlgorithm);

    const { hashAlgorithm, padding, saltLength } = $getSigningParams(signingAlgorithm);

    const privateKeyObject = crypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    // For RSA signatures
    if (signingAlgorithm.startsWith("RSASSA")) {
      const signer = crypto.createSign(hashAlgorithm);
      signer.update(data);

      if (signingAlgorithm.includes("PSS")) {
        // For PSS padding
        return signer.sign({
          key: privateKeyObject,
          padding,
          saltLength
        });
      }
      // For PKCS1 v1.5 padding
      return signer.sign({
        key: privateKeyObject,
        padding
      });
    }
    if (signingAlgorithm.startsWith("ECDSA")) {
      // For ECDSA signatures
      const signer = crypto.createSign(hashAlgorithm);
      signer.update(data);
      return signer.sign({
        key: privateKeyObject,
        dsaEncoding: "ieee-p1363" // Based on AWS KMS implementation, where ECDSA signatures follow the ANSI X9.62-2005 format, which is equivalent to the IEEE-P1363 format
      });
    }
    throw new BadRequestError({
      message: `Signing algorithm ${signingAlgorithm} not implemented`
    });
  };

  const verify = (data: Buffer, signature: Buffer, publicKey: Buffer, signingAlgorithm: SigningAlgorithm): boolean => {
    try {
      $validateAlgorithmWithKeyType(signingAlgorithm);

      const { hashAlgorithm, padding, saltLength } = $getSigningParams(signingAlgorithm);

      // For RSA signatures
      if (signingAlgorithm.startsWith("RSASSA")) {
        const verifier = crypto.createVerify(hashAlgorithm);
        verifier.update(data);

        if (signingAlgorithm.includes("PSS")) {
          // For PSS padding
          return verifier.verify(
            {
              key: publicKey.toString(),
              padding,
              saltLength
            },
            signature
          );
        }
        // For PKCS1 v1.5 padding
        return verifier.verify(
          {
            key: publicKey.toString(),
            padding
          },
          signature
        );
      }
      // For ECDSA signatures
      if (signingAlgorithm.startsWith("ECDSA")) {
        const verifier = crypto.createVerify(hashAlgorithm);
        verifier.update(data);
        return verifier.verify(
          {
            key: publicKey.toString(),
            dsaEncoding: "ieee-p1363"
          },
          signature
        );
      }
      throw new BadRequestError({
        message: `Verification for algorithm ${signingAlgorithm} not implemented`
      });
    } catch (error) {
      logger.error(error, "KMS: Failed to verify signature");
      return false;
    }
  };

  return {
    sign,
    verify,
    generateAsymmetricPrivateKey,
    getPublicKeyFromPrivateKey
  };
};
