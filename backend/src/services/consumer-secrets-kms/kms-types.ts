import { Knex } from "knex";

import { SymmetricEncryption } from "@app/lib/crypto/cipher";

export enum KmsDataKey {
  Organization,
  SecretManager
  // CertificateManager
}

export enum KmsType {
  External = "external",
  Internal = "internal"
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
  encryptionAlgorithm?: SymmetricEncryption;
  isReserved?: boolean;
  name?: string;
  description?: string;
  tx?: Knex;
};

export type TEncryptWithKmsDTO = {
  kmsId: string;
  plainText: Buffer;
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
