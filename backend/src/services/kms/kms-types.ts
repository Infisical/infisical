import { Knex } from "knex";

export type TGenerateKMSDTO = {
  orgId: string;
  isReserved?: boolean;
  slug?: string;
  tx?: Knex;
};

export enum EncryptionMode {
  KMS = "kms",
  EncryptionKey = "encryption-key"
}

export type TEncryptWithKmsDTO = {
  type?: EncryptionMode.KMS;
  kmsId: string;
  plainText: Buffer;
};

export type TEncryptionWithKeyDTO = {
  type: EncryptionMode.EncryptionKey;
  encryptionKey: Buffer;
  plainText: Buffer;
};

export type TKmsServiceEncryptionDTO = TEncryptWithKmsDTO | TEncryptionWithKeyDTO;

export type TDecryptWithKmsDTO = {
  type?: EncryptionMode.KMS;
  kmsId: string;
  cipherTextBlob: Buffer;
};

export type TDecryptWithEncryptionKeyDTO = {
  type: EncryptionMode.EncryptionKey;
  encryptionKey: Buffer;
  cipherTextBlob: Buffer;
};

export type TKmsServiceDecryptionDTO = TDecryptWithKmsDTO | TDecryptWithEncryptionKeyDTO;
