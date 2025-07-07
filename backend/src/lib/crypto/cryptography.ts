// NOTE: DO NOT USE crypto-js ANYWHERE EXCEPT THIS FILE.
// We use crypto-js purely to get around our native node crypto FIPS restrictions in FIPS mode.
import crypto, { subtle } from "node:crypto";

import bcrypt from "bcrypt";
import cryptoJs from "crypto-js";
import nacl from "tweetnacl";
import naclUtils from "tweetnacl-util";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { ADMIN_CONFIG_DB_UUID } from "@app/services/super-admin/super-admin-service";

import { isBase64 } from "../base64";
import { getConfig } from "../config/env";
import { CryptographyError } from "../errors";
import { logger } from "../logger";

enum DigestType {
  Hex = "hex",
  Base64 = "base64"
}

export enum SymmetricKeySize {
  Bits128 = "128-bits",
  Bits256 = "256-bits"
}

type TDecryptSymmetricInput =
  | {
      ciphertext: string;
      iv: string;
      tag: string;
      key: string | Buffer; // can be hex encoded or buffer
      keySize: SymmetricKeySize.Bits128;
    }
  | {
      ciphertext: string;
      iv: string;
      tag: string;
      key: string; // must be base64 encoded
      keySize: SymmetricKeySize.Bits256;
    };

type TEncryptSymmetricInput =
  | {
      plaintext: string;
      key: string;
      keySize: SymmetricKeySize.Bits256;
    }
  | {
      plaintext: string;
      key: string | Buffer;
      keySize: SymmetricKeySize.Bits128;
    };

type TDecryptAsymmetricInput = {
  ciphertext: string;
  nonce: string;
  publicKey: string;
  privateKey: string;
};

const bytesToBits = (bytes: number) => bytes * 8;

const IV_BYTES_SIZE = 12;
const BLOCK_SIZE_BYTES_16 = 16;

const hasherFipsValidated = () => {
  const keySize = 32;

  // For the salt when using pkdf2, we do salt rounds^6. If the salt rounds are 10, this will result in 10^6 = 1.000.000 iterations.
  // The reason for this is because pbkdf2 is not as compute intense as bcrypt, making it faster to brute-force.
  // From my testing, doing salt rounds^6 brings the computational power required to a little more than bcrypt.
  // OWASP recommends a minimum of 600.000 iterations for pbkdf2, so 1.000.000 is more than enough.
  // Ref: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2
  const MIN_COST_FACTOR = 10;
  const MAX_COST_FACTOR = 20; // Iterations scales polynomial (costFactor^6), so we need an upper bound

  const $calculateIterations = (costFactor: number) => {
    return Math.round(costFactor ** 6);
  };

  const $hashPassword = (password: Buffer, salt: Buffer, iterations: number, keyLength: number) => {
    return new Promise<Buffer>((resolve, reject) => {
      crypto.pbkdf2(password, salt, iterations, keyLength, "sha256", (err, derivedKey) => {
        if (err) {
          return reject(err);
        }
        resolve(derivedKey);
      });
    });
  };

  const $validatePassword = async (
    inputPassword: Buffer,
    storedHash: Buffer,
    salt: Buffer,
    iterations: number,
    keyLength: number
  ) => {
    const computedHash = await $hashPassword(inputPassword, salt, iterations, keyLength);

    return crypto.timingSafeEqual(computedHash, storedHash);
  };

  const hash = async (password: string, costFactor: number) => {
    // Strict input validation
    if (typeof password !== "string" || password.length === 0) {
      throw new CryptographyError({
        message: "Invalid input, password must be a non-empty string"
      });
    }

    if (!Number.isInteger(costFactor)) {
      throw new CryptographyError({
        message: "Invalid cost factor, must be an integer"
      });
    }

    if (costFactor < MIN_COST_FACTOR || costFactor > MAX_COST_FACTOR) {
      throw new CryptographyError({
        message: `Invalid cost factor, must be between ${MIN_COST_FACTOR} and ${MAX_COST_FACTOR}`
      });
    }

    const iterations = $calculateIterations(costFactor);

    const salt = crypto.randomBytes(16);
    const derivedKey = await $hashPassword(Buffer.from(password), salt, iterations, keySize);

    const combined = Buffer.concat([salt, derivedKey]);
    return `$v1$${costFactor}$${combined.toString("base64")}`; // Store original costFactor!
  };

  const compare = async (password: string, hashedPassword: string) => {
    try {
      if (!hashedPassword?.startsWith("$v1$")) return false;

      const parts = hashedPassword.split("$");
      if (parts.length !== 4) return false;

      const [, , storedCostFactor, combined] = parts;

      if (
        !Number.isInteger(Number(storedCostFactor)) ||
        Number(storedCostFactor) < MIN_COST_FACTOR ||
        Number(storedCostFactor) > MAX_COST_FACTOR
      ) {
        return false;
      }

      const combinedBuffer = Buffer.from(combined, "base64");
      const salt = combinedBuffer.subarray(0, 16);
      const storedHash = combinedBuffer.subarray(16);

      const iterations = $calculateIterations(Number(storedCostFactor));

      const isMatch = await $validatePassword(Buffer.from(password), storedHash, salt, iterations, keySize);

      return isMatch;
    } catch {
      return false;
    }
  };

  return {
    hash,
    compare
  };
};

const generateAsymmetricKeyPairFipsValidated = () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("x25519");

  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64")
  };
};

const encryptAsymmetricFipsValidated = (data: string, publicKey: string, privateKey: string) => {
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    type: "spki",
    format: "der"
  });

  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    type: "pkcs8",
    format: "der"
  });

  // Generate shared secret using x25519 curve
  const sharedSecret = crypto.diffieHellman({
    privateKey: privKeyObj,
    publicKey: pubKeyObj
  });

  const nonce = crypto.randomBytes(24);

  // Derive 32-byte key from shared secret
  const key = crypto.createHash("sha256").update(sharedSecret).digest();

  // Use first 12 bytes of nonce as IV for AES-GCM
  const iv = nonce.subarray(0, 12);

  // Encrypt with AES-256-GCM
  const cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, key, iv);

  const ciphertext = cipher.update(data, "utf8");
  cipher.final();

  const authTag = cipher.getAuthTag();

  // Combine ciphertext and auth tag
  const combined = Buffer.concat([ciphertext, authTag]);

  return {
    ciphertext: combined.toString("base64"),
    nonce: nonce.toString("base64")
  };
};

const decryptAsymmetricFipsValidated = ({
  ciphertext,
  nonce,
  publicKey,
  privateKey
}: {
  ciphertext: string;
  nonce: string;
  publicKey: string;
  privateKey: string;
}) => {
  // Convert base64 keys back to key objects
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.from(publicKey, "base64"),
    type: "spki",
    format: "der"
  });

  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.from(privateKey, "base64"),
    type: "pkcs8",
    format: "der"
  });

  // Generate same shared secret
  const sharedSecret = crypto.diffieHellman({
    privateKey: privKeyObj,
    publicKey: pubKeyObj
  });

  const nonceBuffer = Buffer.from(nonce, "base64");
  const combinedBuffer = Buffer.from(ciphertext, "base64");

  // Split ciphertext and auth tag (last 16 bytes for GCM)
  const actualCiphertext = combinedBuffer.subarray(0, -16);
  const authTag = combinedBuffer.subarray(-16);

  // Derive same 32-byte key
  const key = crypto.createHash("sha256").update(sharedSecret).digest();

  // Use first 12 bytes of nonce as IV
  const iv = nonceBuffer.subarray(0, 12);

  // Decrypt
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = decipher.update(actualCiphertext);

  try {
    const final = decipher.final();
    return Buffer.concat([plaintext, final]).toString("utf8");
  } catch (error) {
    throw new CryptographyError({
      message: "Invalid ciphertext or keys"
    });
  }
};

const generateAsymmetricKeyPairNoFipsValidation = () => {
  const pair = nacl.box.keyPair();

  return {
    publicKey: naclUtils.encodeBase64(pair.publicKey),
    privateKey: naclUtils.encodeBase64(pair.secretKey)
  };
};

export const encryptAsymmetricNoFipsValidation = (plaintext: string, publicKey: string, privateKey: string) => {
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    naclUtils.decodeUTF8(plaintext),
    nonce,
    naclUtils.decodeBase64(publicKey),
    naclUtils.decodeBase64(privateKey)
  );

  return {
    ciphertext: naclUtils.encodeBase64(ciphertext),
    nonce: naclUtils.encodeBase64(nonce)
  };
};

const decryptAsymmetricNoFipsValidation = ({ ciphertext, nonce, publicKey, privateKey }: TDecryptAsymmetricInput) => {
  const plaintext: Uint8Array | null = nacl.box.open(
    naclUtils.decodeBase64(ciphertext),
    naclUtils.decodeBase64(nonce),
    naclUtils.decodeBase64(publicKey),
    naclUtils.decodeBase64(privateKey)
  );

  if (plaintext == null) throw Error("Invalid ciphertext or keys");

  return naclUtils.encodeUTF8(plaintext);
};

export const generateAsymmetricKeyPair = () => {
  const pair = nacl.box.keyPair();

  return {
    publicKey: naclUtils.encodeBase64(pair.publicKey),
    privateKey: naclUtils.encodeBase64(pair.secretKey)
  };
};

export const computeMd5 = (message: string, digest: DigestType = DigestType.Hex) => {
  let encoder;
  switch (digest) {
    case DigestType.Hex:
      encoder = cryptoJs.enc.Hex;
      break;
    case DigestType.Base64:
      encoder = cryptoJs.enc.Base64;
      break;
    default:
      throw new CryptographyError({
        message: `Invalid digest type: ${digest as string}`
      });
  }

  return cryptoJs.MD5(message).toString(encoder);
};

const cryptographyFactory = () => {
  // placeholder for now
  let $fipsEnabled = false;
  let $isInitialized = false;

  const $checkIsInitialized = () => {
    if (!$isInitialized) {
      throw new CryptographyError({
        message: "Internal cryptography module is not initialized"
      });
    }
  };

  const isFipsModeEnabled = (options: { skipInitializationCheck?: boolean } = {}) => {
    if (!options?.skipInitializationCheck) {
      $checkIsInitialized();
    }
    return $fipsEnabled;
  };

  const verifyFipsLicense = (licenseService: Pick<TLicenseServiceFactory, "onPremFeatures">) => {
    if (isFipsModeEnabled({ skipInitializationCheck: true }) && !licenseService.onPremFeatures?.fips) {
      throw new CryptographyError({
        message: "FIPS mode is enabled but your license does not include FIPS support. Please contact support."
      });
    }
  };

  const $setFipsModeEnabled = (enabled: boolean) => {
    // If FIPS is enabled, we need to validate that the ENCRYPTION_KEY is in a base64 format, and is a 256-bit key.
    if (enabled) {
      const appCfg = getConfig();

      if (appCfg.ENCRYPTION_KEY) {
        // we need to validate that the ENCRYPTION_KEY is a base64 encoded 256-bit key

        // note(daniel): for some reason this resolves as true for some hex-encoded strings.
        if (!isBase64(appCfg.ENCRYPTION_KEY)) {
          throw new CryptographyError({
            message:
              "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a base64 encoded 256-bit key.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
          });
        }

        if (bytesToBits(Buffer.from(appCfg.ENCRYPTION_KEY, "base64").length) !== 256) {
          throw new CryptographyError({
            message:
              "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a 256-bit key.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
          });
        }
      } else {
        throw new CryptographyError({
          message:
            "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not set.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
        });
      }
    }
    $fipsEnabled = enabled;
    $isInitialized = true;
  };

  const initialize = async (superAdminDAL: TSuperAdminDALFactory) => {
    if ($isInitialized) {
      return isFipsModeEnabled();
    }

    if (process.env.FIPS_ENABLED !== "true") {
      logger.info("[FIPS]: Instance is running in non-FIPS mode.");
      return false;
    }

    const serverCfg = await superAdminDAL.findById(ADMIN_CONFIG_DB_UUID).catch(() => null);

    // if fips mode is enabled, we need to check if the deployment is a new deployment or an old one.
    if (serverCfg) {
      if (serverCfg.fipsEnabled) {
        logger.info("[FIPS]: Instance is configured for FIPS mode of operation. Continuing startup with FIPS enabled.");
        $setFipsModeEnabled(true);
        return true;
      }
      logger.info("[FIPS]: Instance age predates FIPS mode inception date. Continuing without FIPS.");
      $setFipsModeEnabled(false);
      return false;
    }

    logger.info("[FIPS]: First time initializing cryptography module on a new deployment. FIPS mode is enabled.");

    // TODO(daniel): check if it's an enterprise deployment

    // if there is no server cfg, and FIPS_MODE is `true`, its a fresh FIPS deployment. We need to set the fipsEnabled to true.
    $setFipsModeEnabled(true);
    return true;
  };

  const encryption = () => {
    $checkIsInitialized();

    const asymmetric = () => {
      const generateKeyPair = () => {
        if (isFipsModeEnabled()) {
          return generateAsymmetricKeyPairFipsValidated();
        }
        return generateAsymmetricKeyPairNoFipsValidation();
      };

      const encrypt = (data: string, publicKey: string, privateKey: string) => {
        if (isFipsModeEnabled()) {
          return encryptAsymmetricFipsValidated(data, publicKey, privateKey);
        }
        return encryptAsymmetricNoFipsValidation(data, publicKey, privateKey);
      };

      const decrypt = ({ ciphertext, nonce, publicKey, privateKey }: TDecryptAsymmetricInput) => {
        if (isFipsModeEnabled()) {
          return decryptAsymmetricFipsValidated({ ciphertext, nonce, publicKey, privateKey });
        }
        return decryptAsymmetricNoFipsValidation({ ciphertext, nonce, publicKey, privateKey });
      };

      return {
        generateKeyPair,
        encrypt,
        decrypt
      };
    };

    const decryptSymmetric = ({ ciphertext, iv, tag, key, keySize }: TDecryptSymmetricInput): string => {
      let decipher;

      if (keySize === SymmetricKeySize.Bits128) {
        // Not ideal: 128-bit hex key (32 chars) gets interpreted as 32 UTF-8 bytes (256 bits)
        // This works but reduces effective key entropy from 256 to 128 bits
        decipher = crypto.createDecipheriv(SecretEncryptionAlgo.AES_256_GCM, key, Buffer.from(iv, "base64"));
      } else {
        const secretKey = crypto.createSecretKey(key, "base64");
        decipher = crypto.createDecipheriv(SecretEncryptionAlgo.AES_256_GCM, secretKey, Buffer.from(iv, "base64"));
      }

      decipher.setAuthTag(Buffer.from(tag, "base64"));
      let cleartext = decipher.update(ciphertext, "base64", "utf8");
      cleartext += decipher.final("utf8");

      return cleartext;
    };

    const encryptSymmetric = ({ plaintext, key, keySize }: TEncryptSymmetricInput) => {
      let iv;
      let cipher;

      if (keySize === SymmetricKeySize.Bits128) {
        iv = crypto.randomBytes(BLOCK_SIZE_BYTES_16);
        cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, key, iv);
      } else {
        iv = crypto.randomBytes(IV_BYTES_SIZE);
        cipher = crypto.createCipheriv(SecretEncryptionAlgo.AES_256_GCM, crypto.createSecretKey(key, "base64"), iv);
      }

      let ciphertext = cipher.update(plaintext, "utf8", "base64");
      ciphertext += cipher.final("base64");

      return {
        ciphertext,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64")
      };
    };

    const encryptWithRootEncryptionKey = (data: string) => {
      const appCfg = getConfig();
      const rootEncryptionKey = appCfg.ROOT_ENCRYPTION_KEY;
      const encryptionKey = appCfg.ENCRYPTION_KEY;

      if (rootEncryptionKey) {
        const { iv, tag, ciphertext } = encryptSymmetric({
          plaintext: data,
          key: rootEncryptionKey,
          keySize: SymmetricKeySize.Bits256
        });
        return {
          iv,
          tag,
          ciphertext,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          encoding: SecretKeyEncoding.BASE64
        };
      }
      if (encryptionKey) {
        const { iv, tag, ciphertext } = encryptSymmetric({
          plaintext: data,
          key: encryptionKey,
          keySize: SymmetricKeySize.Bits128
        });
        return {
          iv,
          tag,
          ciphertext,
          algorithm: SecretEncryptionAlgo.AES_256_GCM,
          encoding: SecretKeyEncoding.UTF8
        };
      }
      throw new CryptographyError({
        message: "Missing both encryption keys"
      });
    };

    const decryptWithRootEncryptionKey = <T = string>({
      keyEncoding,
      ciphertext,
      tag,
      iv
    }: Omit<TDecryptSymmetricInput, "key" | "keySize"> & {
      keyEncoding: SecretKeyEncoding;
    }) => {
      const appCfg = getConfig();
      // the or gate is used used in migration
      const rootEncryptionKey = appCfg?.ROOT_ENCRYPTION_KEY || process.env.ROOT_ENCRYPTION_KEY;
      const encryptionKey = appCfg?.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
      if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
        const data = decryptSymmetric({
          key: rootEncryptionKey,
          iv,
          tag,
          ciphertext,
          keySize: SymmetricKeySize.Bits256
        });
        return data as T;
      }
      if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
        const data = decryptSymmetric({ key: encryptionKey, iv, tag, ciphertext, keySize: SymmetricKeySize.Bits128 });
        return data as T;
      }
      throw new CryptographyError({
        message: "Missing both encryption keys"
      });
    };

    return {
      asymmetric,
      encryptWithRootEncryptionKey,
      decryptWithRootEncryptionKey,
      encryptSymmetric,
      decryptSymmetric
    };
  };

  const hashing = () => {
    $checkIsInitialized();
    // mark this function as deprecated
    /**
     * @deprecated Do not use MD5 unless you absolutely have to. It is considered an unsafe hashing algorithm, and should only be used if absolutely necessary.
     */
    const md5 = (message: string, digest: DigestType = DigestType.Hex) => {
      // If FIPS is enabled and we need MD5, we use the crypto-js implementation.
      // Avoid this at all costs unless strictly necessary, like for mongo atlas digest auth.
      if (isFipsModeEnabled()) {
        return computeMd5(message, digest);
      }
      return crypto.createHash("md5").update(message).digest(digest);
    };

    const createHash = async (password: string, saltRounds: number) => {
      if (isFipsModeEnabled()) {
        const hasher = hasherFipsValidated();

        const hash = await hasher.hash(password, saltRounds);
        return hash;
      }
      const hash = await bcrypt.hash(password, saltRounds);
      return hash;
    };

    const compareHash = async (password: string, hash: string) => {
      if (isFipsModeEnabled()) {
        const isValid = await hasherFipsValidated().compare(password, hash);
        return isValid;
      }
      const isValid = await bcrypt.compare(password, hash);
      return isValid;
    };

    return {
      md5,
      createHash,
      compareHash
    };
  };

  return {
    initialize,
    isFipsModeEnabled,
    hashing,
    verifyFipsLicense,
    encryption,
    randomBytes: crypto.randomBytes,
    randomInt: crypto.randomInt,
    rawCrypto: {
      createHash: crypto.createHash,
      createHmac: crypto.createHmac,
      sign: crypto.sign,
      verify: crypto.verify,
      createSign: crypto.createSign,
      createVerify: crypto.createVerify,
      generateKeyPair: crypto.generateKeyPair,
      createCipheriv: crypto.createCipheriv,
      createDecipheriv: crypto.createDecipheriv,
      createPublicKey: crypto.createPublicKey,
      createPrivateKey: crypto.createPrivateKey,
      getRandomValues: crypto.getRandomValues,
      randomUUID: crypto.randomUUID,
      subtle: {
        // eslint-disable-next-line @typescript-eslint/unbound-method
        generateKey: subtle.generateKey,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        importKey: subtle.importKey,
        // eslint-disable-next-line @typescript-eslint/unbound-method
        exportKey: subtle.exportKey
      },
      constants: crypto.constants,
      X509Certificate: crypto.X509Certificate,
      KeyObject: crypto.KeyObject,
      Hash: crypto.Hash
    }
  };
};

const factoryInstance = cryptographyFactory();

export type TCryptographyFactory = ReturnType<typeof cryptographyFactory>;

export { factoryInstance as crypto, DigestType };
