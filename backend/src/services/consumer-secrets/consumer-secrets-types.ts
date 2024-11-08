import { SymmetricEncryption } from '@app/lib/crypto/cipher';
import { OrderByDirection } from '@app/lib/types';

export type TCreateConsumerSecretDTO = {
  orgId: string;
  projectId: string;
  name: string;
  description?: string;
  encryptionAlgorithm: SymmetricEncryption;
};

export type TUpdabteConsumerSecretByIdDTO = {
  keyId: string;
  name?: string;
  isDisabled?: boolean;
  description?: string;
};

export type TListConsumerSecretsByProjectIdDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: ConsumerSecretOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export type TConsumerSecretEncryptDTO = {
  keyId: string;
  plaintext: string;
};

export type TConsumerSecretDecryptDTO = {
  keyId: string;
  ciphertext: string;
};

export enum ConsumerSecretOrderBy {
  Name = 'name',
}
