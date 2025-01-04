import { OrderByDirection } from "@app/hooks/api/generic/types";

export type TCmek = {
  id: string;
  name: string;
  description?: string;
  encryptionAlgorithm: EncryptionAlgorithm;
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

export type TCreateCmek = Pick<TCmek, "name" | "description" | "encryptionAlgorithm"> & ProjectRef;
export type TUpdateCmek = KeyRef &
  Partial<Pick<TCmek, "name" | "description" | "isDisabled">> &
  ProjectRef;
export type TDeleteCmek = KeyRef & ProjectRef;

export type TCmekEncrypt = KeyRef & { plaintext: string; isBase64Encoded?: boolean };
export type TCmekDecrypt = KeyRef & { ciphertext: string };

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

export type TCmekDecryptResponse = {
  plaintext: string;
};

export enum CmekOrderBy {
  Name = "name"
}

export enum EncryptionAlgorithm {
  AES_GCM_256 = "aes-256-gcm",
  AES_GCM_128 = "aes-128-gcm"
}
