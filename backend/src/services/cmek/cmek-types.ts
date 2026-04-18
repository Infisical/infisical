import { SymmetricKeyAlgorithm } from "@app/lib/crypto/cipher";
import { AsymmetricKeyAlgorithm, SigningAlgorithm } from "@app/lib/crypto/sign";
import { OrderByDirection } from "@app/lib/types";

import { KmsKeyUsage } from "../kms/kms-types";

export type TCmekKeyEncryptionAlgorithm = SymmetricKeyAlgorithm | AsymmetricKeyAlgorithm;

export type TCreateCmekDTO = {
  orgId: string;
  projectId: string;
  name: string;
  description?: string;
  encryptionAlgorithm: TCmekKeyEncryptionAlgorithm;
  keyUsage: KmsKeyUsage;
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

export type TCmekListSigningAlgorithmsDTO = {
  keyId: string;
};

export type TCmekGetPublicKeyDTO = {
  keyId: string;
};

export type TCmekGetPrivateKeyDTO = {
  keyId: string;
};

export type TCmekBulkGetPrivateKeysDTO = {
  keyIds: string[];
};

export type TCmekBulkImportKeyEntry = {
  name: string;
  algorithm: TCmekKeyEncryptionAlgorithm;
  keyUsage: KmsKeyUsage;
  keyMaterial: string;
};

export type TCmekBulkImportKeysDTO = {
  projectId: string;
  keys: TCmekBulkImportKeyEntry[];
};

export type TCmekSignDTO = {
  keyId: string;
  data: string;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};

export type TCmekVerifyDTO = {
  keyId: string;
  data: string;
  signature: string;
  signingAlgorithm: SigningAlgorithm;
  isDigest: boolean;
};
