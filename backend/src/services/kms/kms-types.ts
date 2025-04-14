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
  preDigested: boolean;
};

export type TVerifyWithKmsDTO = {
  kmsId: string;
  data: Buffer;
  signature: Buffer;
  signingAlgorithm: SigningAlgorithm;
  preDigested: boolean;
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

export type TImportKeyMaterialDTO = {
  key: Buffer;
  algorithm: SymmetricKeyAlgorithm;
  name?: string;
  isReserved: boolean;
  projectId: string;
  orgId: string;
  keyUsage: KmsKeyUsage;
};
