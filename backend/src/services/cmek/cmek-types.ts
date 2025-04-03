import { SymmetricKeyEncryptDecrypt } from "@app/lib/crypto/cipher";
import { AsymmetricKeySignVerify, SigningAlgorithm } from "@app/lib/crypto/sign";
import { OrderByDirection } from "@app/lib/types";

import { KmsKeyIntent } from "../kms/kms-types";

export type TCmekKeyEncryptionAlgorithm = SymmetricKeyEncryptDecrypt | AsymmetricKeySignVerify;

export type TCreateCmekDTO = {
  orgId: string;
  projectId: string;
  name: string;
  description?: string;
  encryptionAlgorithm: TCmekKeyEncryptionAlgorithm;
  type: KmsKeyIntent;
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

export type TCmekSignDTO = {
  keyId: string;
  data: string;
  signingAlgorithm: SigningAlgorithm;
};

export type TCmekVerifyDTO = {
  keyId: string;
  data: string;
  signature: string;
  signingAlgorithm: SigningAlgorithm;
};
