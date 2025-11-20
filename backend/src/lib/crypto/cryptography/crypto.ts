// NOTE: DO NOT USE crypto-js ANYWHERE EXCEPT THIS FILE.
// We use crypto-js purely to get around our native node crypto FIPS restrictions in FIPS mode.

import crypto, { subtle } from "node:crypto";

import bcrypt from "bcrypt";
import jwtDep from "jsonwebtoken";
import nacl from "tweetnacl";
import naclUtils from "tweetnacl-util";

import { SecretEncryptionAlgo, SecretKeyEncoding } from "@app/db/schemas";
import { isHsmActiveAndEnabled } from "@app/ee/services/hsm/hsm-fns";
import { THsmServiceFactory } from "@app/ee/services/hsm/hsm-service";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TKmsRootConfigDALFactory } from "@app/services/kms/kms-root-config-dal";
import { RootKeyEncryptionStrategy } from "@app/services/kms/kms-types";
import { TSuperAdminDALFactory } from "@app/services/super-admin/super-admin-dal";
import { ADMIN_CONFIG_DB_UUID } from "@app/services/super-admin/super-admin-service";

import { getConfig, TEnvConfig } from "../../config/env";
import { CryptographyError } from "../../errors";
import { logger } from "../../logger";
import { asymmetricFipsValidated } from "./asymmetric-fips";
import { hasherFipsValidated } from "./hash-fips";
import type { TDecryptAsymmetricInput, TDecryptSymmetricInput, TEncryptSymmetricInput } from "./types";
import { DigestType, SymmetricKeySize } from "./types";

const bytesToBits = (bytes: number) => bytes * 8;

const IV_BYTES_SIZE = 12;
const BLOCK_SIZE_BYTES_16 = 16;

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

const cryptographyFactory = () => {
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
    const appCfg = getConfig();

    if (
      !appCfg.isDevelopmentMode &&
      isFipsModeEnabled({ skipInitializationCheck: true }) &&
      !licenseService.onPremFeatures?.fips
    ) {
      throw new CryptographyError({
        message: "FIPS mode is enabled but your license does not include FIPS support. Please contact support."
      });
    }
  };

  const $setFipsModeEnabled = async (
    enabled: boolean,
    hsmService: THsmServiceFactory,
    kmsRootConfigDAL: TKmsRootConfigDALFactory,
    envCfg?: Pick<TEnvConfig, "ENCRYPTION_KEY" | "ROOT_ENCRYPTION_KEY">
  ) => {
    // If FIPS is enabled, we need to validate that the ENCRYPTION_KEY is in a base64 format, and is a 256-bit key.
    if (enabled) {
      crypto.setFips(true);

      const appCfg = envCfg || getConfig();

      const hsmStatus = await isHsmActiveAndEnabled({
        hsmService,
        kmsRootConfigDAL
      });

      // if the encryption strategy is software - user needs to provide an encryption key
      // if the encryption strategy is null AND the hsm is not configured - user needs to provide an encryption key
      const needsEncryptionKey =
        hsmStatus.rootKmsConfigEncryptionStrategy === RootKeyEncryptionStrategy.Software ||
        (hsmStatus.rootKmsConfigEncryptionStrategy === null && !hsmStatus.isHsmConfigured);

      // only perform encryption key validation if it's actually required.
      if (needsEncryptionKey) {
        const encryptionKey = appCfg.ROOT_ENCRYPTION_KEY || appCfg.ENCRYPTION_KEY;

        if (encryptionKey) {
          // we need to validate that the ENCRYPTION_KEY is a base64 encoded 256-bit key

          // note(daniel): for some reason this resolves as true for some hex-encoded strings.
          if (!encryptionKey) {
            throw new CryptographyError({
              message:
                "FIPS mode is enabled, but the ENCRYPTION_KEY environment variable is not a base64 encoded 256-bit key.\nYou can generate a 256-bit key using the following command: `openssl rand -base64 32`"
            });
          }

          if (bytesToBits(Buffer.from(encryptionKey, "base64").length) !== 256) {
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
    }
    $fipsEnabled = enabled;
    $isInitialized = true;
  };

  const initialize = async (
    superAdminDAL: TSuperAdminDALFactory,
    hsmService: THsmServiceFactory,
    kmsRootConfigDAL: TKmsRootConfigDALFactory,
    envCfg?: Pick<TEnvConfig, "ENCRYPTION_KEY">
  ) => {
    if ($isInitialized) {
      return isFipsModeEnabled();
    }

    if (process.env.FIPS_ENABLED !== "true") {
      logger.info("Cryptography module initialized in normal operation mode.");
      await $setFipsModeEnabled(false, hsmService, kmsRootConfigDAL, envCfg);
      return false;
    }

    const serverCfg = await superAdminDAL.findById(ADMIN_CONFIG_DB_UUID).catch(() => null);

    // if fips mode is enabled, we need to check if the deployment is a new deployment or an old one.
    if (serverCfg) {
      if (serverCfg.fipsEnabled) {
        logger.info("[FIPS]: Instance is configured for FIPS mode of operation. Continuing startup with FIPS enabled.");
        await $setFipsModeEnabled(true, hsmService, kmsRootConfigDAL, envCfg);
        return true;
      }
      logger.info("[FIPS]: Instance age predates FIPS mode inception date. Continuing without FIPS.");
      await $setFipsModeEnabled(false, hsmService, kmsRootConfigDAL, envCfg);
      return false;
    }

    logger.info("[FIPS]: First time initializing cryptography module on a new deployment. FIPS mode is enabled.");

    // TODO(daniel): check if it's an enterprise deployment

    // if there is no server cfg, and FIPS_MODE is `true`, its a fresh FIPS deployment. We need to set the fipsEnabled to true.
    await $setFipsModeEnabled(true, hsmService, kmsRootConfigDAL, envCfg);
    return true;
  };

  const encryption = () => {
    $checkIsInitialized();

    const asymmetric = () => {
      const generateKeyPair = async () => {
        if (isFipsModeEnabled()) {
          const keyPair = await asymmetricFipsValidated().generateKeyPair();
          return keyPair;
        }
        return generateAsymmetricKeyPairNoFipsValidation();
      };

      const encrypt = (data: string, publicKey: string, privateKey: string) => {
        if (isFipsModeEnabled()) {
          return asymmetricFipsValidated().encryptAsymmetric(data, publicKey, privateKey);
        }
        return encryptAsymmetricNoFipsValidation(data, publicKey, privateKey);
      };

      const decrypt = ({ ciphertext, nonce, publicKey, privateKey }: TDecryptAsymmetricInput) => {
        if (isFipsModeEnabled()) {
          return asymmetricFipsValidated().decryptAsymmetric({ ciphertext, nonce, publicKey, privateKey });
        }
        return decryptAsymmetricNoFipsValidation({ ciphertext, nonce, publicKey, privateKey });
      };

      return {
        generateKeyPair,
        encrypt,
        decrypt
      };
    };

    const symmetric = () => {
      const decrypt = ({ ciphertext, iv, tag, key, keySize }: TDecryptSymmetricInput): string => {
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

      const encrypt = ({ plaintext, key, keySize }: TEncryptSymmetricInput) => {
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

      const encryptWithRootEncryptionKey = (
        data: string,
        appCfgOverride?: Pick<TEnvConfig, "ROOT_ENCRYPTION_KEY" | "ENCRYPTION_KEY">
      ) => {
        const appCfg = appCfgOverride || getConfig();
        const rootEncryptionKey = appCfg.ROOT_ENCRYPTION_KEY;
        const encryptionKey = appCfg.ENCRYPTION_KEY;

        // Sanity check
        if (!rootEncryptionKey && !encryptionKey) {
          throw new CryptographyError({
            message: "Tried to encrypt with instance root encryption key, but no root encryption key is set."
          });
        }

        if (rootEncryptionKey) {
          const { iv, tag, ciphertext } = encrypt({
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
          const { iv, tag, ciphertext } = encrypt({
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

        // Sanity check
        if (!rootEncryptionKey && !encryptionKey) {
          throw new CryptographyError({
            message: "Tried to decrypt with instance root encryption key, but no root encryption key is set."
          });
        }

        if (rootEncryptionKey && keyEncoding === SecretKeyEncoding.BASE64) {
          const data = symmetric().decrypt({
            key: rootEncryptionKey,
            iv,
            tag,
            ciphertext,
            keySize: SymmetricKeySize.Bits256
          });
          return data as T;
        }
        if (encryptionKey && keyEncoding === SecretKeyEncoding.UTF8) {
          const data = symmetric().decrypt({
            key: encryptionKey,
            iv,
            tag,
            ciphertext,
            keySize: SymmetricKeySize.Bits128
          });
          return data as T;
        }
        throw new CryptographyError({
          message: "Missing both encryption keys"
        });
      };

      return {
        decrypt,
        encrypt,
        encryptWithRootEncryptionKey,
        decryptWithRootEncryptionKey
      };
    };

    return {
      asymmetric,
      symmetric
    };
  };

  const hashing = () => {
    $checkIsInitialized();
    /**
     * @deprecated Do not use MD5 unless you absolutely have to. It is considered an unsafe hashing algorithm, and should only be used if absolutely necessary.
     */
    const md5 = (message: string, digest: DigestType = DigestType.Hex) => {
      // If FIPS is enabled, we block MD5 directly.
      if (isFipsModeEnabled()) {
        throw new CryptographyError({
          message: "MD5 is not supported in FIPS mode of operation"
        });
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
  const jwt = () => {
    $checkIsInitialized();

    return {
      sign: jwtDep.sign,
      verify: jwtDep.verify,
      decode: jwtDep.decode
    };
  };

  return {
    initialize,
    isFipsModeEnabled,
    verifyFipsLicense,
    hashing,
    encryption,
    jwt,
    randomBytes: crypto.randomBytes,
    randomInt: crypto.randomInt,
    nativeCrypto: {
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
        generateKey: subtle.generateKey.bind(subtle),
        importKey: subtle.importKey.bind(subtle),
        exportKey: subtle.exportKey.bind(subtle)
      },
      constants: crypto.constants,
      X509Certificate: crypto.X509Certificate,
      KeyObject: crypto.KeyObject,
      Hash: crypto.Hash,
      timingSafeEqual: crypto.timingSafeEqual
    }
  };
};

const factoryInstance = cryptographyFactory();

export { factoryInstance as crypto, DigestType };
