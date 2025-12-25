import { Knex } from "knex";

import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";

export enum KmsDataKey {
  Organization,
  SecretManager
  // CertificateManager
}

export enum KmsType {
  External = "external",
  Internal = "internal"
}

export enum KmsKeyUsage {
  ENCRYPT_DECRYPT = "encrypt-decrypt",
  SIGN_VERIFY = "sign-verify"
}

/**
 * Status of a key rotation operation.
 * Used for tracking and audit purposes.
 */
export enum KmsKeyRotationStatus {
  /** Rotation completed successfully */
  COMPLETED = "completed",
  /** Rotation is currently in progress */
  IN_PROGRESS = "in_progress",
  /** Rotation failed - check logs for details */
  FAILED = "failed"
}

export type TEncryptWithKmsDataKeyDTO =
  | { type: KmsDataKey.Organization; orgId: string }
  | { type: KmsDataKey.SecretManager; projectId: string };
// akhilmhdh: not implemented yet
// | {
//     type: KmsDataKey.CertificateManager;
//     projectId: string;
//   };

export type TGenerateKMSDTO = {
  orgId: string;
  projectId?: string;
  encryptionAlgorithm?: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm;
  keyUsage?: KmsKeyUsage;
  isReserved?: boolean;
  name?: string;
  description?: string;
  tx?: Knex;
};

export type TEncryptWithKmsDTO = {
  kmsId: string;
  plainText: Buffer;
};

export type TGetPublicKeyDTO = {
  kmsId: string;
};

export type TSignWithKmsDTO = {
  kmsId: string;
  data: Buffer;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};

export type TVerifyWithKmsDTO = {
  kmsId: string;
  data: Buffer;
  signature: Buffer;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};

export type TEncryptionWithKeyDTO = {
  key: Buffer;
  plainText: Buffer;
};

export type TDecryptWithKmsDTO = {
  kmsId: string;
  cipherTextBlob: Buffer;
};

export type TDecryptWithKeyDTO = {
  key: Buffer;
  cipherTextBlob: Buffer;
};

export type TUpdateProjectSecretManagerKmsKeyDTO = {
  projectId: string;
  kms: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string };
};

export enum RootKeyEncryptionStrategy {
  Software = "SOFTWARE",
  HSM = "HSM"
}

/** Milliseconds per day - used for rotation interval calculations */
export const MS_PER_DAY = 86_400_000;

export const KMS_ROTATION_CONSTANTS = {
  DEFAULT_INTERVAL_DAYS: 90,
  MIN_INTERVAL_DAYS: 1,
  MAX_INTERVAL_DAYS: 365,
  MAX_VERSIONS_TO_RETAIN: 100,
  LOCK_DURATION_MS: 60_000,
  LOCK_RETRY_COUNT: 3,
  QUEUE_BATCH_SIZE: 100,
  MAX_RETRIES: 3
} as const;
export type TGetKeyMaterialDTO = {
  kmsId: string;
};

export type TImportKeyMaterialDTO = {
  key: Buffer;
  algorithm: SymmetricKeyAlgorithm;
  name?: string;
  isReserved: boolean;
  projectId: string;
  orgId: string;
  keyUsage: KmsKeyUsage;
  kmipMetadata?: Record<string, unknown> | null;
};
