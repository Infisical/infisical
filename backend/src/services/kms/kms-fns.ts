import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { crypto } from "@app/lib/crypto/cryptography";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm } from "@app/lib/crypto/sign";
import { BadRequestError } from "@app/lib/errors";

import { EccNistKeyAlgorithm, KeyAgreementAlgorithm, KmsKeyUsage } from "./kms-types";

export const MIN_HMAC_IMPORT_KEY_BYTE_LENGTH = 16;
export const MAX_HMAC_IMPORT_KEY_BYTE_LENGTH = 1024;

/**
 * The row holding the *currently active* wrapped root key.
 *
 * Not "the config row" any more: it is a compatibility handle. An app version predating rotation looks
 * this id up and knows nothing about staged or retained rows, so keeping the active key here is what
 * lets it boot. New code finds rows by trial decryption.
 */
export const KMS_ROOT_CONFIG_UUID = "00000000-0000-0000-0000-000000000000";

/** Fixed so a concurrent seed is a PK conflict rather than a second row. */
export const KMS_LEGACY_ENCRYPTION_KEY_UUID = "00000000-0000-0000-0000-000000000001";

/**
 * The AES key a given environment resolves to.
 *
 * Single-sourced deliberately: a rotation has to predict exactly what a booting instance will compute
 * from the value it hands the operator, and a second copy of this rule would drift into a key that does
 * not boot. Callers that need the prediction pass a simulated environment rather than reimplementing it.
 */
export const resolveInstanceEncryptionKeyBuffer = (envCfg: {
  ENCRYPTION_KEY?: string;
  ROOT_ENCRYPTION_KEY?: string;
}) => {
  const encryptionKey = envCfg.ENCRYPTION_KEY || envCfg.ROOT_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new BadRequestError({
      message: "Instance encryption key not found. Did you set the ENCRYPTION_KEY environment variable?"
    });
  }

  const isUtf8Key = Boolean(envCfg.ENCRYPTION_KEY);
  const buffer = Buffer.from(encryptionKey, isUtf8Key ? "utf8" : "base64");
  if (buffer.length !== 32) {
    throw new BadRequestError({
      message: `The configured encryption key resolves to ${buffer.length} bytes, but 32 are required. Generate one with '${
        isUtf8Key ? "openssl rand -hex 16" : "openssl rand -base64 32"
      }'.`
    });
  }

  return buffer;
};

const KEK_LABEL_DOMAIN = "infisical:kek-fingerprint:v1";

/**
 * A label, never a lookup key: it lets an operator match a restored dump against an archived key.
 * Derived from the key, so an operator holding an archived key can recompute it and confirm the match.
 * Truncated SHA-256 over a 128-bit-minimum key is not reversible, so it is safe to log and expose.
 */
export const getKekLabel = (keyBuffer: Buffer) =>
  crypto.nativeCrypto.createHash("sha256").update(KEK_LABEL_DOMAIN).update(keyBuffer).digest("hex").slice(0, 32);

export const getByteLengthForSymmetricEncryptionAlgorithm = (encryptionAlgorithm: SymmetricKeyAlgorithm) => {
  switch (encryptionAlgorithm) {
    case SymmetricKeyAlgorithm.AES_GCM_128:
      return 16;
    case SymmetricKeyAlgorithm.AES_GCM_256:
    default:
      return 32;
  }
};

type TKeyUsageAlgorithmConfig = {
  algorithmEnum: Record<string, string>;
  errorMessage: string;
};

const keyUsageAlgorithmMap: Record<KmsKeyUsage, TKeyUsageAlgorithmConfig> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: {
    algorithmEnum: SymmetricKeyAlgorithm,
    errorMessage: "Unsupported encryption algorithm for encrypt/decrypt key"
  },
  [KmsKeyUsage.SIGN_VERIFY]: {
    algorithmEnum: AsymmetricKeyAlgorithm,
    errorMessage: "Unsupported sign/verify algorithm for sign/verify key"
  },
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: {
    algorithmEnum: HmacAlgorithm,
    errorMessage: "Unsupported HMAC algorithm for generate/verify MAC key"
  },
  [KmsKeyUsage.KEY_AGREEMENT]: {
    algorithmEnum: EccNistKeyAlgorithm,
    errorMessage: "Unsupported key agreement algorithm for derive secret key"
  }
};

export const verifyKeyTypeAndAlgorithm = (
  keyUsage: KmsKeyUsage,
  algorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm | KeyAgreementAlgorithm,
  extra?: {
    forceType?: KmsKeyUsage;
  }
) => {
  if (extra?.forceType && keyUsage !== extra.forceType) {
    throw new BadRequestError({
      message: `Unsupported key type, expected ${extra.forceType} but got ${keyUsage}`
    });
  }

  const config = keyUsageAlgorithmMap[keyUsage];
  if (!config) {
    throw new BadRequestError({
      message: `Unsupported key type: ${keyUsage as string}`
    });
  }

  if (!Object.values(config.algorithmEnum).includes(algorithm)) {
    throw new BadRequestError({
      message: `${config.errorMessage}: ${algorithm as string}`
    });
  }

  return true;
};
