import { z } from "zod";

import { OrderByDirection } from "@app/hooks/api/generic/types";

export enum KmsKeyUsage {
  ENCRYPT_DECRYPT = "encrypt-decrypt",
  SIGN_VERIFY = "sign-verify"
}

export type TCmek = {
  id: string;
  keyUsage: KmsKeyUsage;
  name: string;
  description?: string;
  encryptionAlgorithm: AsymmetricKeyAlgorithm | SymmetricKeyAlgorithm;
  projectId: string;
  isDisabled: boolean;
  isReserved: boolean;
  orgId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectRef = { projectId: string };
type KeyRef = { keyId: string };

export type TCreateCmek = Pick<TCmek, "name" | "description" | "encryptionAlgorithm" | "keyUsage"> &
  ProjectRef;
export type TUpdateCmek = KeyRef &
  Partial<Pick<TCmek, "name" | "description" | "isDisabled">> &
  ProjectRef;
export type TDeleteCmek = KeyRef & ProjectRef;

export type TCmekEncrypt = KeyRef & { plaintext: string; isBase64Encoded?: boolean };
export type TCmekDecrypt = KeyRef & { ciphertext: string };

export type TCmekSign = KeyRef & { data: string; signingAlgorithm: SigningAlgorithm };
export type TCmekVerify = KeyRef & {
  data: string;
  signature: string;
  signingAlgorithm: SigningAlgorithm;
};

export type TProjectCmeksList = {
  keys: TCmek[];
  totalCount: number;
};

export type TListProjectCmeksDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: CmekOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TCmekEncryptResponse = {
  ciphertext: string;
};

export type TCmekSignResponse = {
  signature: string;
  keyId: string;
  signingAlgorithm: SigningAlgorithm;
};

export type TCmekVerifyResponse = {
  signatureValid: boolean;
  keyId: string;
  signingAlgorithm: SigningAlgorithm;
};

export type TCmekDecryptResponse = {
  plaintext: string;
};

export type TCmekGetPublicKeyDTO = {
  keyId: string;
};

export type TCmekGetPublicKeyResponse = {
  publicKey: string;
};

export type TCmekGetPrivateKeyDTO = {
  keyId: string;
};

export type TCmekGetPrivateKeyResponse = {
  privateKey: string;
};

export enum CmekOrderBy {
  Name = "name"
}

export enum AsymmetricKeyAlgorithm {
  RSA_4096 = "RSA_4096",
  ECC_NIST_P256 = "ECC_NIST_P256"
}

// Supported symmetric encrypt/decrypt algorithms
export enum SymmetricKeyAlgorithm {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}

export const AllowedEncryptionKeyAlgorithms = z.enum([
  ...Object.values(SymmetricKeyAlgorithm),
  ...Object.values(AsymmetricKeyAlgorithm)
] as [string, ...string[]]).options;

export enum SigningAlgorithm {
  // RSA PSS algorithms
  RSASSA_PSS_SHA_256 = "RSASSA_PSS_SHA_256",
  RSASSA_PSS_SHA_384 = "RSASSA_PSS_SHA_384",
  RSASSA_PSS_SHA_512 = "RSASSA_PSS_SHA_512",

  // RSA PKCS#1 v1.5 algorithms
  RSASSA_PKCS1_V1_5_SHA_256 = "RSASSA_PKCS1_V1_5_SHA_256",
  RSASSA_PKCS1_V1_5_SHA_384 = "RSASSA_PKCS1_V1_5_SHA_384",
  RSASSA_PKCS1_V1_5_SHA_512 = "RSASSA_PKCS1_V1_5_SHA_512",

  // ECDSA algorithms
  ECDSA_SHA_256 = "ECDSA_SHA_256",
  ECDSA_SHA_384 = "ECDSA_SHA_384",
  ECDSA_SHA_512 = "ECDSA_SHA_512"
}
