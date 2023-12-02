import type { UserWsKeyPair } from "../keys/types";
import type { WsTag } from "../tags/types";

export type EncryptedSecret = {
  _id: string;
  version: number;
  workspace: string;
  type: "shared" | "personal";
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
  skipMultilineEncoding?: boolean;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  tags: WsTag[];
};

export type DecryptedSecret = {
  _id: string;
  version: number;
  key: string;
  value: string;
  comment: string;
  reminderRepeatDays?: number | null;
  reminderNote?: string | null;
  tags: WsTag[];
  createdAt: string;
  updatedAt: string;
  env: string;
  valueOverride?: string;
  idOverride?: string;
  overrideAction?: string;
  folderId?: string;
  skipMultilineEncoding?: boolean;
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
  skipMultilineEncoding?: boolean;
  createdAt: string;
  updatedAt: string;
};

// dto
export type TGetProjectSecretsKey = {
  workspaceId: string;
  environment: string;
  secretPath?: string;
};

export type TGetProjectSecretsDTO = {
  decryptFileKey: UserWsKeyPair;
} & TGetProjectSecretsKey;

export type TGetProjectSecretsAllEnvDTO = {
  workspaceId: string;
  envs: string[];
  decryptFileKey: UserWsKeyPair;
  folderId?: string;
  secretPath?: string;
  isPaused?: boolean;
};

export type GetSecretVersionsDTO = {
  secretId: string;
  limit: number;
  offset: number;
  decryptFileKey: UserWsKeyPair;
};

export type TCreateSecretsV3DTO = {
  latestFileKey: UserWsKeyPair;
  secretName: string;
  secretValue: string;
  secretComment: string;
  skipMultilineEncoding?: boolean;
  secretPath: string;
  workspaceId: string;
  environment: string;
  type: string;
};

export type TUpdateSecretsV3DTO = {
  latestFileKey: UserWsKeyPair;
  workspaceId: string;
  environment: string;
  type: string;
  secretPath: string;
  skipMultilineEncoding?: boolean;
  newSecretName?: string;
  secretName: string;
  secretId?: string;
  secretValue: string;
  secretComment?: string;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  tags?: string[];
};

export type TDeleteSecretsV3DTO = {
  workspaceId: string;
  environment: string;
  type: "shared" | "personal";
  secretPath: string;
  secretName: string;
  secretId?: string;
};

export type TCreateSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  latestFileKey: UserWsKeyPair;
  secrets: Array<{
    secretName: string;
    secretValue: string;
    secretComment: string;
    skipMultilineEncoding?: boolean;
    type: "shared" | "personal";
    metadata?: {
      source?: string;
    };
  }>;
};

export type TUpdateSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  latestFileKey: UserWsKeyPair;
  secrets: Array<{
    type: "shared" | "personal";
    secretName: string;
    skipMultilineEncoding?: boolean;
    secretValue: string;
    secretComment: string;
    tags?: string[];
  }>;
};

export type TDeleteSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  secrets: Array<{
    secretName: string;
    type: "shared" | "personal";
  }>;
};

export type CreateSecretDTO = {
  workspaceId: string;
  environment: string;
  type: "shared" | "personal";
  secretKey: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretPath: string;
  metadata?: {
    source?: string;
  };
};
