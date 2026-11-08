import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign/types";
import { OrderByDirection } from "@app/lib/types";

import { KmsKeyUsage } from "../model/kms-key";

export enum KmsDataKey {
  Organization,
  SecretManager
}

export enum KmsType {
  External = "external",
  Internal = "internal"
}

export enum KmsKeyOrderBy {
  Name = "name"
}

export type TKmsKeyAlgorithm = SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;

export type TEncryptWithKmsDataKeyDTO =
  | { type: KmsDataKey.Organization; orgId: string }
  | { type: KmsDataKey.SecretManager; projectId: string };

export type TGenerateKMSDTO = {
  orgId: string;
  projectId?: string;
  encryptionAlgorithm?: TKmsKeyAlgorithm;
  keyUsage?: KmsKeyUsage;
  isReserved?: boolean;
  isExportable?: boolean;
  hasDeleteProtection?: boolean;
  name?: string;
  description?: string;
};

export type TImportKeyMaterialDTO = {
  key: Buffer;
  algorithm: TKmsKeyAlgorithm;
  name?: string;
  isReserved: boolean;
  isExportable?: boolean;
  hasDeleteProtection?: boolean;
  projectId: string;
  orgId: string;
  keyUsage: KmsKeyUsage;
  kmipMetadata?: Record<string, unknown> | null;
};

export type TEncryptWithKmsDTO = { kmsId: string; plainText: Buffer };
export type TDecryptWithKmsDTO = { kmsId: string; cipherTextBlob: Buffer };
export type TEncryptionWithKeyDTO = { key: Buffer; plainText: Buffer };
export type TDecryptWithKeyDTO = { key: Buffer; cipherTextBlob: Buffer };

// Reads the key on the primary instead of a replica, for a caller that may have just created it.
export type TKmsReadOptions = { consistency?: "replica" | "primary" };

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

export type TGenerateMacDTO = { kmsId: string; data: Buffer };
export type TVerifyMacDTO = { kmsId: string; data: Buffer; mac: Buffer };

export type TUpdateProjectSecretManagerKmsKeyDTO = {
  projectId: string;
  kms: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string };
};

export type TListKmsKeysDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: KmsKeyOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TFindKmsKeysFilter = {
  id?: string;
  orgId?: string;
  projectId?: string | null;
  name?: string;
  isReserved?: boolean;
  keyUsage?: KmsKeyUsage;
};

export type TUpdateKmsKeyAttributesDTO = {
  name?: string;
  description?: string | null;
  isDisabled?: boolean;
  hasDeleteProtection?: boolean;
  isExportable?: boolean;
  kmipMetadata?: Record<string, unknown> | null;
};

export type TEncryptor = (input: { plainText: Buffer }) => { cipherTextBlob: Buffer<ArrayBuffer> };
export type TDecryptor = (input: { cipherTextBlob: Buffer }) => Buffer<ArrayBuffer>;
export type TAsyncEncryptor = (input: { plainText: Buffer }) => Promise<{ cipherTextBlob: Buffer<ArrayBuffer> }>;
export type TAsyncDecryptor = (input: { cipherTextBlob: Buffer }) => Promise<Buffer<ArrayBuffer>>;

export type TCipherPair = {
  encryptor: TEncryptor;
  decryptor: TDecryptor;
  generateSecretBlindIndex: (secretValue: Buffer) => Promise<string>;
};

// No version of a KMS key could decrypt a ciphertext. A plain Error, so callers decrypting stored data still answer
// 500; a route decrypting its caller's input (CMEK) maps it to a 400.
export class KmsCiphertextUndecryptableError extends Error {
  constructor(cause: unknown) {
    super("No version of the KMS key could decrypt the ciphertext", { cause });
    this.name = "KmsCiphertextUndecryptableError";
  }
}
