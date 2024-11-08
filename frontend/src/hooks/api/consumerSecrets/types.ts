import { OrderByDirection } from '@app/hooks/api/generic/types';

export type TConsumerSecret = {
  id: string;
  name: string;
  content?: string;
  projectId: string;
  isReserved: boolean;
  orgId: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectRef = { projectId: string };
type KeyRef = { keyId: string };

export type TCreateConsumerSecret = Pick<TConsumerSecret, 'name' | 'content'> &
  ProjectRef;
export type TUpdateConsumerSecret = KeyRef &
  Partial<Pick<TConsumerSecret, 'name' | 'content'>> &
  ProjectRef;
export type TDeleteConsumerSecret = KeyRef & ProjectRef;

export type TConsumerSecretEncrypt = KeyRef & {
  plaintext: string;
  isBase64Encoded?: boolean;
};
export type TConsumerSecretDecrypt = KeyRef & { ciphertext: string };

export type TProjectConsumerSecretsList = {
  keys: TConsumerSecret[];
  totalCount: number;
};

export type TListProjectConsumerSecretsDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: ConsumerSecretOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TConsumerSecretEncryptResponse = {
  ciphertext: string;
};

export type TConsumerSecretDecryptResponse = {
  plaintext: string;
};

export enum ConsumerSecretOrderBy {
  Name = 'name',
}

export enum EncryptionAlgorithm {
  AES_GCM_256 = 'aes-256-gcm',
  AES_GCM_128 = 'aes-128-gcm',
}
