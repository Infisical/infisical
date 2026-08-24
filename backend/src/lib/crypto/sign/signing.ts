import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

import { crypto } from "@app/lib/crypto/cryptography";
import { opensslDerivePublicKey, opensslGenpkey, opensslSign, opensslVerify } from "@app/lib/crypto/pqc/pqc-openssl";
import { BadRequestError } from "@app/lib/errors";
import { cleanTemporaryDirectory, createTemporaryDirectory, writeToTemporaryFile } from "@app/lib/files";
import { logger } from "@app/lib/logger";

import { getOpenSSLExtBinPath, isOpenSSLExtAvailable } from "../ed25519/openssl-ext";
import { AsymmetricKeyAlgorithm, SigningAlgorithm, TAsymmetricSignVerifyFns } from "./types";

export const isPqcKeyAlgorithm = (algo: string): boolean => algo.startsWith("ML_DSA");

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
const OPENSSL_EXT_BIN_PATH = getOpenSSLExtBinPath();

const SHA256_DIGEST_LENGTH = 32;
const SHA384_DIGEST_LENGTH = 48;
const SHA512_DIGEST_LENGTH = 64;

export const KMS_TO_OPENSSL_NAME: Partial<Record<AsymmetricKeyAlgorithm, string>> = {
  [AsymmetricKeyAlgorithm.ML_DSA_44]: "ML-DSA-44",
  [AsymmetricKeyAlgorithm.ML_DSA_65]: "ML-DSA-65",
  [AsymmetricKeyAlgorithm.ML_DSA_87]: "ML-DSA-87"
};

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
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA512_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_256:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA256,
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA256_DIGEST_LENGTH
        };
      case SigningAlgorithm.RSASSA_PSS_SHA_384:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA384,
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PSS_PADDING,
          saltLength: SHA384_DIGEST_LENGTH
        };

      // RSA PKCS#1 v1.5
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_512:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA512,
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_384:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA384,
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PADDING
        };
      case SigningAlgorithm.RSASSA_PKCS1_V1_5_SHA_256:
        return {
          hashAlgorithm: SupportedHashAlgorithm.SHA256,
          padding: crypto.nativeCrypto.constants.RSA_PKCS1_PADDING
        };
      // ECDSA
      case SigningAlgorithm.ECDSA_SHA_256:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA256 };
      case SigningAlgorithm.ECDSA_SHA_384:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA384 };
      case SigningAlgorithm.ECDSA_SHA_512:
        return { hashAlgorithm: SupportedHashAlgorithm.SHA512 };

      case SigningAlgorithm.ED25519_SHA_512:
        // no-op , algorithm defaults to sha512
        return { hashAlgorithm: SupportedHashAlgorithm.SHA512 };

      case SigningAlgorithm.ED25519_PH_SHA_512:
        // no-op , algorithm defaults to sha512
        return { hashAlgorithm: SupportedHashAlgorithm.SHA512 };

      default:
        throw new Error(`Unsupported signing algorithm: ${signingAlgorithm as string}`);
    }
  };

  const $getEcCurveName = (keyAlgorithm: AsymmetricKeyAlgorithm): { full: string; short: string } => {
    // We will support more in the future
    switch (keyAlgorithm) {
      case AsymmetricKeyAlgorithm.ECC_NIST_P256:
        return { full: "prime256v1", short: "p256" };
      case AsymmetricKeyAlgorithm.ECC_NIST_P384:
        return { full: "secp384r1", short: "p384" };
      case AsymmetricKeyAlgorithm.ECC_NIST_P521:
        return { full: "secp521r1", short: "p521" };
      default:
        throw new Error(`Unsupported EC curve: ${keyAlgorithm}`);
    }
  };

  const $validateAlgorithmWithKeyType = (signingAlgorithm: SigningAlgorithm) => {
    const isRsaKey = algorithm.startsWith("RSA");
    const isEccKey = algorithm.startsWith("ECC_NIST_P");
    const isPqcKey = isPqcKeyAlgorithm(algorithm);
    const isED25519Key = algorithm === AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519;

    const isRsaAlgorithm = signingAlgorithm.startsWith("RSASSA");
    const isEccAlgorithm = signingAlgorithm.startsWith("ECDSA");
    const isPqcAlgorithm = isPqcKeyAlgorithm(signingAlgorithm);
    const isED25519Algorithm = signingAlgorithm.startsWith("ED25519");

    if (isPqcKey) {
      if (!isPqcAlgorithm || (signingAlgorithm as string) !== (algorithm as string)) {
        throw new BadRequestError({
          message: `KMS ${algorithm} key can only be used with ${algorithm} signing algorithm`
        });
      }
    }

    if (!((isED25519Key && isED25519Algorithm) || (isRsaKey && isRsaAlgorithm) || (isEccKey && isEccAlgorithm))) {
      throw new BadRequestError({ message: `KMS ${algorithm} key cannot be used with ${signingAlgorithm}` });
    }
  };

  const $signED25519Digest = async (
    digest: Buffer,
    privateKey: Buffer,
    _: SupportedHashAlgorithm,
    signingAlgorithm: SigningAlgorithm
  ) => {
    if (!isOpenSSLExtAvailable()) {
      throw new BadRequestError({
        message: "ED25519_PH_SHA_512 is unavailable because the OpenSSL extension is not installed or unsupported"
      });
    }
    const tempDir = await createTemporaryDirectory("ed25519-sign");
    const digestPath = path.join(tempDir, "digest.bin");
    const keyPath = path.join(tempDir, "key.pem");
    const sigPath = path.join(tempDir, "signature.bin");

    try {
      if (digest.length !== SHA512_DIGEST_LENGTH) {
        throw new BadRequestError({
          message: `${signingAlgorithm} requires a SHA-512 digest`
        });
      }

      await writeToTemporaryFile(digestPath, digest);
      await writeToTemporaryFile(keyPath, privateKey);

      const { stderr } = await execFileAsync(
        OPENSSL_EXT_BIN_PATH,
        ["-sign", "-inkey", keyPath, "-in", digestPath, "-out", sigPath, "-pkeyopt", "digest:Ed25519ph"],
        {
          maxBuffer: 10 * 1024 * 1024,
          timeout: COMMAND_TIMEOUT
        }
      );

      if (stderr) {
        logger.error(stderr, "KMS: Failed to sign Ed25519 digest");
        throw new BadRequestError({
          message: "Failed to sign Ed25519 digest due to signing error"
        });
      }

      const signature = await fs.readFile(sigPath);

      if (signature.length === 0) {
        throw new BadRequestError({
          message: "No signature was created. Ensure that the input is a SHA-512 digest."
        });
      }

      return signature;
    } catch (err) {
      if (err instanceof BadRequestError) {
        throw err;
      }
      logger.error(err, "KMS: Failed to sign Ed25519ph digest");
      throw new BadRequestError({
        message: `Failed to sign Ed25519ph digest with ${signingAlgorithm} due to signing error. Ensure that your digest is hashed with SHA-512.`
      });
    } finally {
      await cleanTemporaryDirectory(tempDir);
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

  const $verifyED25519Digest = async (
    digest: Buffer,
    signature: Buffer,
    publicKey: Buffer,
    hashAlgorithm: SupportedHashAlgorithm
  ): Promise<boolean> => {
    if (hashAlgorithm !== SupportedHashAlgorithm.SHA512 || digest.length !== SHA512_DIGEST_LENGTH) {
      throw new BadRequestError({ message: "ED25519_PH_SHA_512 requires a SHA-512 digest" });
    }

    if (!isOpenSSLExtAvailable()) {
      throw new BadRequestError({
        message: "ED25519_PH_SHA_512 is unavailable because the OpenSSL extension is not installed or unsupported"
      });
    }

    const tempDir = await createTemporaryDirectory("ed25519-signature-verification");
    const publicKeyPath = path.join(tempDir, "public-key.der");
    const signaturePath = path.join(tempDir, "signature.bin");
    const digestPath = path.join(tempDir, "digest.bin");

    try {
      await Promise.all([
        writeToTemporaryFile(publicKeyPath, publicKey),
        writeToTemporaryFile(signaturePath, signature),
        writeToTemporaryFile(digestPath, digest)
      ]);

      await execFileAsync(
        OPENSSL_EXT_BIN_PATH,
        [
          "-verify",
          "-inkey",
          publicKeyPath,
          "-in",
          digestPath,
          "-sigfile",
          signaturePath,
          "-pkeyopt",
          "digest:Ed25519ph"
        ],
        { maxBuffer: 10 * 1024 * 1024, timeout: COMMAND_TIMEOUT }
      );

      return true;
    } catch (error) {
      const err = error as { stderr?: string };
      if (!err.stderr?.toLowerCase().includes("signature verification failure")) {
        logger.error(error, "KMS: Failed to verify Ed25519ph signature");
      }
      return false;
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
      const err = error as { stderr: string };

      if (
        !err?.stderr?.toLowerCase()?.includes("signature verification failure") &&
        !err?.stderr?.toLowerCase()?.includes("bad signature")
      ) {
        logger.error(error, "KMS: Failed to verify RSA signature");
      }
      return false;
    } finally {
      await cleanTemporaryDirectory(tempDir);
    }
  };

  const verifyDigestFunctionsMap: Partial<
    Record<
      AsymmetricKeyAlgorithm,
      (data: Buffer, signature: Buffer, publicKey: Buffer, hashAlgorithm: SupportedHashAlgorithm) => Promise<boolean>
    >
  > = {
    [AsymmetricKeyAlgorithm.ECC_NIST_P256]: $verifyEccDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_P384]: $verifyEccDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_P521]: $verifyEccDigest,
    [AsymmetricKeyAlgorithm.RSA_4096]: $verifyRsaDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519]: $verifyED25519Digest
  };

  const signDigestFunctionsMap: Partial<
    Record<
      AsymmetricKeyAlgorithm,
      (
        data: Buffer,
        privateKey: Buffer,
        hashAlgorithm: SupportedHashAlgorithm,
        signingAlgorithm: SigningAlgorithm
      ) => Promise<Buffer>
    >
  > = {
    [AsymmetricKeyAlgorithm.ECC_NIST_P256]: $signEccDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_P384]: $signEccDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_P521]: $signEccDigest,
    [AsymmetricKeyAlgorithm.RSA_4096]: $signRsaDigest,
    [AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519]: $signED25519Digest
  };

  const sign = async (
    data: Buffer,
    privateKey: Buffer,
    signingAlgorithm: SigningAlgorithm,
    isDigest: boolean
  ): Promise<Buffer> => {
    $validateAlgorithmWithKeyType(signingAlgorithm);

    if (isPqcKeyAlgorithm(algorithm)) {
      if (isDigest) {
        throw new BadRequestError({ message: "ML-DSA does not support digested input" });
      }
      const sig = await opensslSign(privateKey, data);
      return sig;
    }

    const { hashAlgorithm, padding, saltLength } = $getSigningParams(signingAlgorithm);

    if (signingAlgorithm === SigningAlgorithm.ED25519_PH_SHA_512) {
      if (!isDigest) {
        throw new BadRequestError({
          message: `${signingAlgorithm} requires digested input`
        });
      }
    }

    if (signingAlgorithm === SigningAlgorithm.ED25519_SHA_512 && isDigest) {
      throw new BadRequestError({
        message: `${signingAlgorithm} does not support digested input; use ${SigningAlgorithm.ED25519_PH_SHA_512}`
      });
    }

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

    const privateKeyObject = crypto.nativeCrypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    // For RSA signatures
    if (signingAlgorithm.startsWith("RSA")) {
      const signer = crypto.nativeCrypto.createSign(hashAlgorithm);
      signer.update(data);

      return signer.sign({
        key: privateKeyObject,
        padding,
        ...(signingAlgorithm.includes("PSS") ? { saltLength } : {})
      });
    }
    if (signingAlgorithm.startsWith("ECDSA")) {
      // For ECDSA signatures
      const signer = crypto.nativeCrypto.createSign(hashAlgorithm);
      signer.update(data);
      return signer.sign({
        key: privateKeyObject,
        dsaEncoding: "der"
      });
    }
    if (signingAlgorithm === SigningAlgorithm.ED25519_SHA_512) {
      return crypto.nativeCrypto.sign(null, data, privateKeyObject);
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

      if (isPqcKeyAlgorithm(algorithm)) {
        if (isDigest) {
          throw new BadRequestError({ message: "ML-DSA does not support digested input" });
        }
        return await opensslVerify(publicKey, signature, data);
      }

      if (signingAlgorithm === SigningAlgorithm.ED25519_PH_SHA_512) {
        if (!isDigest) {
          throw new BadRequestError({
            message: `${signingAlgorithm} requires digested input`
          });
        }
      }

      if (signingAlgorithm === SigningAlgorithm.ED25519_SHA_512 && isDigest) {
        throw new BadRequestError({
          message: `${signingAlgorithm} does not support digested input; use ${SigningAlgorithm.ED25519_PH_SHA_512}`
        });
      }

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

      const publicKeyObject = crypto.nativeCrypto.createPublicKey({
        key: publicKey,
        format: "der",
        type: "spki"
      });

      // For RSA signatures
      if (signingAlgorithm.startsWith("RSA")) {
        const verifier = crypto.nativeCrypto.createVerify(hashAlgorithm);
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
        const verifier = crypto.nativeCrypto.createVerify(hashAlgorithm);
        verifier.update(data);
        return verifier.verify(
          {
            key: publicKeyObject,
            dsaEncoding: "der"
          },
          signature
        );
      }
      if (signingAlgorithm === SigningAlgorithm.ED25519_SHA_512) {
        return crypto.nativeCrypto.verify(null, data, publicKeyObject, signature);
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
    if (isPqcKeyAlgorithm(algorithm)) {
      const opensslName = KMS_TO_OPENSSL_NAME[algorithm];
      if (!opensslName) {
        throw new Error(`Unsupported PQC algorithm: ${algorithm}`);
      }
      return opensslGenpkey(opensslName);
    }

    const { privateKey } = await new Promise<{ privateKey: string }>((resolve, reject) => {
      const keyEncoding = {
        publicKeyEncoding: { type: "spki" as const, format: "pem" as const },
        privateKeyEncoding: { type: "pkcs8" as const, format: "pem" as const }
      };
      const handleKeyPair = (err: Error | null, _: string, privateKeyPem: string) => {
        if (err) {
          reject(err);
        } else {
          resolve({ privateKey: privateKeyPem });
        }
      };

      if (algorithm.startsWith("RSA")) {
        crypto.nativeCrypto.generateKeyPair(
          "rsa",
          { ...keyEncoding, modulusLength: Number(algorithm.split("_")[1]) },
          handleKeyPair
        );
      } else if (algorithm === AsymmetricKeyAlgorithm.ECC_NIST_EDWARDS25519) {
        crypto.nativeCrypto.generateKeyPair("ed25519", keyEncoding, handleKeyPair);
      } else {
        const { full: namedCurve } = $getEcCurveName(algorithm);
        crypto.nativeCrypto.generateKeyPair("ec", { ...keyEncoding, namedCurve }, handleKeyPair);
      }
    });

    return Buffer.from(privateKey);
  };

  const getPublicKeyFromPrivateKey = async (privateKey: Buffer): Promise<Buffer> => {
    if (isPqcKeyAlgorithm(algorithm)) {
      return opensslDerivePublicKey(privateKey);
    }

    const privateKeyObj = crypto.nativeCrypto.createPrivateKey({
      key: privateKey,
      format: "pem",
      type: "pkcs8"
    });

    const publicKey = crypto.nativeCrypto.createPublicKey(privateKeyObj).export({
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
