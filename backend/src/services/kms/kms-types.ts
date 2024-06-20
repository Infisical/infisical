import { Knex } from "knex";

export type TGenerateKMSDTO = {
  scopeType: "project" | "org";
  scopeId: string;
  isReserved?: boolean;
  tx?: Knex;
};

export type TEncryptWithKmsDTO = {
  kmsId: string;
  plainText: Buffer;
};

export type TDecryptWithKmsDTO = {
  kmsId: string;
  cipherTextBlob: Buffer;
};
