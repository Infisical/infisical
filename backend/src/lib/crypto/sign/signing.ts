import { execFile } from "child_process";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

import { BadRequestError } from "@app/lib/errors";
import { cleanTemporaryDirectory, createTemporaryDirectory, writeToTemporaryFile } from "@app/lib/files";
import { logger } from "@app/lib/logger";

import { AsymmetricKeyAlgorithm, SigningAlgorithm, TAsymmetricSignVerifyFns } from "./types";

const execFileAsync = promisify(execFile);

interface SigningParams {
  hashAlgorithm: SupportedHashAlgorithm;
  padding?: number;
  saltLength?: number;
}

enum SupportedHashAlgorithm {
  SHA256 = "sha256",
  SHA384 = "sha384",
  SHA512 = "sha512"
}

const COMMAND_TIMEOUT = 15_000;

const SHA256_DIGEST_LENGTH = 32;
const SHA384_DIGEST_LENGTH = 48;
const SHA512_DIGEST_LENGTH = 64;

/**
 * Service for cryptographic signing and verification operations using asymmetric keys
 *
 * @param algorithm The key algorithm itself. The signing algorithm is supplied in the individual sign/verify functions.
 * @returns Object with sign and verify functions
 */
export const signingService = (algorithm: AsymmetricKeyAlgorithm): TAsymmetricSignVerifyFns => {
  const $getSigningParams = (signingAlgorithm: SigningAlgorithm): SigningParams => {
    switch (signingAlgorithm) {
      // RSA PSS
      case SigningAlgorithm.RSASSA_PSS_SHA_512:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA512,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA512_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_256:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA256,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA256_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_384:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA384,
          padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA384_DIGEST_LENGTH
        };

      // RSA PKCS#1 v1.5
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA512,
          padding: crypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA384,
          padding: crypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA256,
          padding: crypto.constants.RSA_PKCS1_PADDING
        };

      // ECDSA
      case SigningAlgorithm.ECDSA_SHA_256:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA256 };
      case SigningAlgorithm.ECDSA_SHA_384:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA384 };
      case SigningAlgorithm.ECDSA_SHA_512:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA512 };

      default:
        throw new Error(`Unsupported signing algorithm: ${signingAlgorithm as string}`);
    }
  };

  const $getEcCurveName = (keyAlgorithm: AsymmetricKeyAlgorithm): { full: string; short: string } => {
    // We will support more in the future
    switch (keyAlgorithm) {
      case AsymmetricKeyAlgorithm.ECC_NIST_P256:
        return {
          full: "prime256v1",
          short: "p256"
        };
      default:
        throw new Error(`Unsupported EC curve: ${keyAlgorithm}`);
    }
  };

  const $validateAlgorithmWithKeyType = (signingAlgorithm: SigningAlgorithm) => {
    const isRsaKey = algorithm.startsWith("RSA");
    const isEccKey = algorithm.startsWith("ECC");

    const isRsaAlgorithm = signingAlgorithm.startsWith("RSASSA");
    const isEccAlgorithm = signingAlgorithm.startsWith("ECDSA");

    if (isRsaKey && !isRsaAlgorithm) {
      throw new BadRequestError({ message: `KMS RSA key cannot be used with ${signingAlgorithm}` });
    }

    if (isEccKey && !isEccAlgorithm) {
      throw new BadRequestError({ message: `KMS ECC key cannot be used with ${signingAlgorithm}` });
    }
  };

  const $signRsaDigest = async (
    digest: Buffer,
    privateKey: Buffer,
    hashAlgorithm: SupportedHashAlgorithm,
    signingAlgorithm: SigningAlgorithm
  ) => {
    const tempDir = await createTemporaryDirectory("kms-rsa-sign");
    const digestPath = path.join(tempDir, "digest.bin");
    const sigPath = path.join(tempDir, "signature.bin");
    const keyPath = path.join(tempDir, "key.pem");

    try {
      await writeToTemporaryFile(digestPath, digest);
      await writeToTemporaryFile(keyPath, privateKey);

      const { stderr } = await execFileAsync(
        "openssl",
        [
          "pkeyutl",
          "-sign",
          "-in",
          digestPath,
          "-inkey",
          keyPath,
          "-pkeyopt",
          `digest:${hashAlgorithm}`,
          "-out",
          sigPath
        ],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: COMMAND_TIMEOUT
        }
      );

      if (stderr) {
        logger.error(stderr, "KMS: Failed to sign RSA digest");
        throw new BadRequestError({
          message: "Failed to sign RSA digest due to signing error"
        });
      }
      const signature = await fs.readFile(sigPath);

      if (!signature) {
        throw new BadRequestError({
          message:
            "No signature was created. Make sure you are using an appropriate signing algorithm that uses the same hashing algorithm as the one used to create the digest."
        });
      }

      return signature;
    } catch (err) {
      logger.error(err, "KMS: Failed to sign RSA digest");
      throw new BadRequestError({
        message: `Failed to sign RSA digest with ${signingAlgorithm} due to signing error. Ensure that your digest is hashed with ${hashAlgorithm.toUpperCase()}.`
      });
    } finally {
      await cleanTemporaryDirectory(tempDir);
    }
  };

  const $signEccDigest = async (
    digest: Buffer,
    privateKey: Buffer,
    hashAlgorithm: SupportedHashAlgorithm,
    signingAlgorithm: SigningAlgorithm
  ) => {
    const tempDir = await createTemporaryDirectory("ecc-sign");
    const digestPath = path.join(tempDir, "digest.bin");
    const keyPath = path.join(tempDir, "key.pem");
    const sigPath = path.join(tempDir, "signature.bin");

    try {
      await writeToTemporaryFile(digestPath, digest);
      await writeToTemporaryFile(keyPath, privateKey);

      const { stderr } = await execFileAsync(
        "openssl",
        [
          "pkeyutl",
          "-sign",
          "-in",
          digestPath,
          "-inkey",
          keyPath,
          "-pkeyopt",
          `digest:${hashAlgorithm}`,
          "-out",
          sigPath
        ],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: COMMAND_TIMEOUT
        }
      );

      if (stderr) {
        logger.error(stderr, "KMS: Failed to sign ECC digest");
        throw new BadRequestError({
          message: "Failed to sign ECC digest due to signing error"
        });
      }

      const signature = await fs.readFile(sigPath);

      if (!signature) {
        throw new BadRequestError({
          message:
            "No signature was created. Make sure you are using an appropriate signing algorithm that uses the same hashing algorithm as the one used to create the digest."
        });
      }

      return signature;
    } catch (err) {
      logger.error(err, "KMS: Failed to sign ECC digest");
      throw new BadRequestError({
        message: `Failed to sign ECC digest with ${signingAlgorithm} due to signing error. Ensure that your digest is hashed with ${hashAlgorithm.toUpperCase()}.`
      });
    } finally {
      await cleanTemporaryDirectory(tempDir);
    }
  };

  const $verifyEccDigest = async (
    digest: Buffer,
    signature: Buffer,
    publicKey: Buffer,
    hashAlgorithm: SupportedHashAlgorithm
  ) => {
    const tempDir = await createTemporaryDirectory("ecc-signature-verification");
    const publicKeyFile = path.join(tempDir, "public-key.pem");
    const sigFile = path.join(tempDir, "signature.sig");
    const digestFile = path.join(tempDir, "digest.bin");

    try {
      await writeToTemporaryFile(publicKeyFile, publicKey);
      await writeToTemporaryFile(sigFile, signature);
      await writeToTemporaryFile(digestFile, digest);

      await execFileAsync(
        "openssl",
        [
          "pkeyutl",
          "-verify",
          "-in",
          digestFile,
          "-inkey",
          publicKeyFile,
          "-pubin", // Important for EC public keys
          "-sigfile",
          sigFile,
          "-pkeyopt",
          `digest:${hashAlgorithm}`
        ],
        { timeout: COMMAND_TIMEOUT }
      );

      return true;
    } catch (error) {
      const err = error as { stderr: string };

      if (
        !err?.stderr?.toLowerCase()?.includes("signature verification failure") &&
        !err?.stderr?.toLowerCase()?.includes("bad signature")
      ) {
        logger.error(error, "KMS: Failed to verify ECC signature");
      }
      return false;
    } finally {
      await cleanTemporaryDirectory(tempDir);
    }
  };

  const $verifyRsaDigest = async (
    digest: Buffer,
    signature: Buffer,
    publicKey: Buffer,
    hashAlgorithm: SupportedHashAlgorithm
  ) => {
    const tempDir = await createTemporaryDirectory("kms-signature-verification");
    const publicKeyFile = path.join(tempDir, "public-key.pub");
    const signatureFile = path.join(tempDir, "signature.sig");
    const digestFile = path.join(tempDir, "digest.bin");

    try {
      await writeToTemporaryFile(publicKeyFile, publicKey);
      await writeToTemporaryFile(signatureFile, signature);
      await writeToTemporaryFile(digestFile, digest);

      await execFileAsync(
        "openssl",
        [
          "pkeyutl",
          "-verify",
          "-in",
          digestFile,
          "-inkey",
          publicKeyFile,
          "-pubin",
          "-sigfile",
          signatureFile,
          "-pkeyopt",
          `digest:${hashAlgorithm}`
        ],
        { timeout: COMMAND_TIMEOUT }
      );

      // it'll throw if the verification was not successful
      return true;
    } catch (error) {
      const err = error as { stdout: string };

      if (!err?.stdout?.toLowerCase()?.includes("signature verification failure")) {
        logger.error(error, "KMS: Failed to verify signature");
      }
      return false;
    } finally {
      await cleanTemporaryDirectory(tempDir);
    }
  };

  const verifyDigestFunctionsMap: Record<
    AsymmetricKeyAlgorithm,
    (data: Buffer, signature: Buffer, publicKey: Buffer, hashAlgorithm: SupportedHashAlgorithm) => Promise<boolean>
  > = {
    [AsymmetricKeyAlgorithm.ECC_NIST_P256]: $verifyEccDigest,
    [AsymmetricKeyAlgorithm.RSA_4096]: $verifyRsaDigest
  };

  const signDigestFunctionsMap: Record<
    AsymmetricKeyAlgorithm,
    (
      data: Buffer,
      privateKey: Buffer,
      hashAlgorithm: SupportedHashAlgorithm,
      signingAlgorithm: SigningAlgorithm
    ) => Promise<Buffer>
  > = {
    [AsymmetricKeyAlgorithm.ECC_NIST_P256]: $signEccDigest,
    [AsymmetricKeyAlgorithm.RSA_4096]: $signRsaDigest
  };

  const sign = async (
    data: Buffer,
    privateKey: Buffer,
    signingAlgorithm: SigningAlgorithm,
    isDigest: boolean
  ): Promise<Buffer> => {
    $validateAlgorithmWithKeyType(signingAlgorithm);

    const { hashAlgorithm, padding, saltLength } = $getSigningParams(signingAlgorithm);

    if (isDigest) {
      if (signingAlgorithm.startsWith("RSASSA_PSS")) {
        throw new BadRequestError({
          message: "RSA PSS does not support digested input"
        });
      }

      const signFunction = signDigestFunctionsMap[algorithm];

      if (!signFunction) {
        throw new BadRequestError({
          message: `Digested input is not supported for key algorithm ${algorithm}`
        });
      }

      const signature = await signFunction(data, privateKey, hashAlgorithm, signingAlgorithm);
      return signature;
    }

    const privateKeyObject = crypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    // For RSA signatures
    if (signingAlgorithm.startsWith("RSA")) {
      const signer = crypto.createSign(hashAlgorithm);
      signer.update(data);

      return signer.sign({
        key: privateKeyObject,
        padding,
        ...(signingAlgorithm.includes("PSS") ? { saltLength } : {})
      });
    }
    if (signingAlgorithm.startsWith("ECDSA")) {
      // For ECDSA signatures
      const signer = crypto.createSign(hashAlgorithm);
      signer.update(data);
      return signer.sign({
        key: privateKeyObject,
        dsaEncoding: "der"
      });
    }
    throw new BadRequestError({
      message: `Signing algorithm ${signingAlgorithm} not implemented`
    });
  };

  const verify = async (
    data: Buffer,
    signature: Buffer,
    publicKey: Buffer,
    signingAlgorithm: SigningAlgorithm,
    isDigest: boolean
  ): Promise<boolean> => {
    try {
      $validateAlgorithmWithKeyType(signingAlgorithm);

      const { hashAlgorithm, padding, saltLength } = $getSigningParams(signingAlgorithm);

      if (isDigest) {
        if (signingAlgorithm.startsWith("RSASSA_PSS")) {
          throw new BadRequestError({
            message: "RSA PSS does not support digested input"
          });
        }

        const verifyFunction = verifyDigestFunctionsMap[algorithm];

        if (!verifyFunction) {
          throw new BadRequestError({
            message: `Digested input is not supported for key algorithm ${algorithm}`
          });
        }

        const signatureValid = await verifyFunction(data, signature, publicKey, hashAlgorithm);

        return signatureValid;
      }

      const publicKeyObject = crypto.createPublicKey({
        key: publicKey,
        format: "der",
        type: "spki"
      });

      // For RSA signatures
      if (signingAlgorithm.startsWith("RSA")) {
        const verifier = crypto.createVerify(hashAlgorithm);
        verifier.update(data);

        return verifier.verify(
          {
            key: publicKeyObject,
            padding,
            ...(signingAlgorithm.includes("PSS") ? { saltLength } : {})
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
            key: publicKeyObject,
            dsaEncoding: "der"
          },
          signature
        );
      }
      throw new BadRequestError({
        message: `Verification for algorithm ${signingAlgorithm} not implemented`
      });
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      logger.error(error, "KMS: Failed to verify signature");
      return false;
    }
  };

  const generateAsymmetricPrivateKey = async () => {
    const { privateKey } = await new Promise<{ privateKey: string }>((resolve, reject) => {
      if (algorithm.startsWith("RSA")) {
        crypto.generateKeyPair(
          "rsa",
          {
            modulusLength: Number(algorithm.split("_")[1]),
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
        const { full: namedCurve } = $getEcCurveName(algorithm);

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
    const privateKeyObj = crypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    const publicKey = crypto.createPublicKey(privateKeyObj).export({
      type: "spki",
      format: "der"
    });

    return publicKey;
  };

  return {
    sign,
    verify,
    generateAsymmetricPrivateKey,
    getPublicKeyFromPrivateKey
  };
};
