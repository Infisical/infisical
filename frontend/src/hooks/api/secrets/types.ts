import type { UserWsKeyPair } from '../keys/types';
import type { WsTag } from '../tags/types';

export type EncryptedSecret = {
  _id: string;
  version: number;
  workspace: string;
  type: 'shared' | 'personal';
  environment: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  __v: number;
  createdAt: string;
  updatedAt: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  tags: WsTag[];
};

export type DecryptedSecret = {
  _id: string;
  key: string;
  value: string;
  comment: string;
  tags: WsTag[];
  createdAt: string;
  updatedAt: string;
  env: string;
  valueOverride?: string;
  idOverride?: string;
  overrideAction?: string;
};

export type EncryptedSecretVersion = {
  _id: string;
  secret: string;
  version: number;
  workspace: string;
  type: string;
  environment: string;
  isDeleted: boolean;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  tags: WsTag[];
  __v: number;
  createdAt: string;
  updatedAt: string;
};

// dto
type SecretTagArg = { _id: string; name: string; slug: string };

export type UpdateSecretArg = {
  _id: string;
  folderId?: string;
  type: 'shared' | 'personal';
  secretName: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  tags: SecretTagArg[];
};

export type CreateSecretArg = Omit<UpdateSecretArg, '_id'>;

export type DeleteSecretArg = { _id: string };

export type BatchSecretDTO = {
  workspaceId: string;
  folderId: string;
  environment: string;
  requests: Array<
    | { method: 'POST'; secret: CreateSecretArg }
    | { method: 'PATCH'; secret: UpdateSecretArg }
    | { method: 'DELETE'; secret: DeleteSecretArg }
  >;
};

export type GetProjectSecretsDTO = {
  workspaceId: string;
  env: string | string[];
  decryptFileKey: UserWsKeyPair;
  folderId?: string;
  isPaused?: boolean;
  onSuccess?: (data: DecryptedSecret[]) => void;
};

export type GetSecretVersionsDTO = {
  secretId: string;
  limit: number;
  offset: number;
  decryptFileKey: UserWsKeyPair;
};
