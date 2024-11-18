import { SymmetricEncryption } from "@app/lib/crypto/cipher";
import { OrderByDirection } from "@app/lib/types";

export type TCreateCmekDTO = {
  orgId: string;
  projectId: string;
  name: string;
  description?: string;
  encryptionAlgorithm: SymmetricEncryption;
};

export type TUpdabteCmekByIdDTO = {
  keyId: string;
  name?: string;
  isDisabled?: boolean;
  description?: string;
};

export type TListCmeksByProjectIdDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: CmekOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TCmekEncryptDTO = {
  keyId: string;
  plaintext: string;
};

export type TCmekDecryptDTO = {
  keyId: string;
  ciphertext: string;
};

export enum CmekOrderBy {
  Name = "name"
}
