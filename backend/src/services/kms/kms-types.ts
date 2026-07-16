import { Knex } from "knex";

import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { HmacAlgorithm } from "@app/lib/crypto/hmac";
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
  SIGN_VERIFY = "sign-verify",
  GENERATE_VERIFY_MAC = "generate-verify-mac"
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
  encryptionAlgorithm?: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;
  keyUsage?: KmsKeyUsage;
  isReserved?: boolean;
  isExportable?: boolean;
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

export type TGenerateMacDTO = {
  kmsId: string;
  data: Buffer;
};

export type TVerifyMacDTO = {
  kmsId: string;
  data: Buffer;
  mac: Buffer;
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
export type TGetKeyMaterialDTO = {
  kmsId: string;
};

export type TGetBulkKeyMaterialDTO = {
  kmsIds: string[];
};

export type TImportKeyMaterialDTO = {
  key: Buffer;
  algorithm: SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm | HmacAlgorithm;
  name?: string;
  isReserved: boolean;
  isExportable?: boolean;
  projectId: string;
  orgId: string;
  keyUsage: KmsKeyUsage;
  kmipMetadata?: Record<string, unknown> | null;
};
