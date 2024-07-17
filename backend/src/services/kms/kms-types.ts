import { Knex } from "knex";

import { TProjectPermission } from "@app/lib/types";

export type TGenerateKMSDTO = {
  orgId: string;
  isReserved?: boolean;
  slug?: string;
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

export type TUpdateProjectKmsDTO = {
  secretManagerKmsKeyId: string;
} & TProjectPermission;
