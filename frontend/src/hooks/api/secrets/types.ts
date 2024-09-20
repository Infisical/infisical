import type { WsTag } from "../tags/types";

export enum SecretType {
  Shared = "shared",
  Personal = "personal"
}

export type EncryptedSecret = {
  id: string;
  version: number;
  workspace: string;
  type: SecretType;
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

// both personal and shared secret stitiched together for dashboard
export type SecretV3RawSanitized = {
  id: string;
  version: number;
  key: string;
  value?: string;
  comment?: string;
  reminderRepeatDays?: number | null;
  reminderNote?: string | null;
  tags?: WsTag[];
  createdAt: string;
  updatedAt: string;
  env: string;
  valueOverride?: string;
  idOverride?: string;
  overrideAction?: string;
  folderId?: string;
  skipMultilineEncoding?: boolean;
};

export type SecretV3Raw = {
  id: string;
  _id: string;
  workspace: string;
  environment: string;
  version: number;
  type: string;
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  secretReminderNote?: string;
  secretReminderRepeatDays?: number;
  skipMultilineEncoding?: boolean;
  metadata?: Record<string, string>;
  tags?: WsTag[];
  createdAt: string;
  updatedAt: string;
};

export type SecretV3RawResponse = {
  secrets: SecretV3Raw[];
  imports: {
    secretPath: string;
    environment: string;
    folderId: string;
    secrets: SecretV3Raw[];
  }[];
};

export type SecretVersions = {
  id: string;
  secretId: string;
  version: number;
  workspace: string;
  type: SecretType;
  isDeleted: boolean;
  envId: string;
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
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
  includeImports?: boolean;
  expandSecretReferences?: boolean;
};

export type TGetProjectSecretsDTO = TGetProjectSecretsKey;

export type TGetProjectSecretsAllEnvDTO = {
  workspaceId: string;
  envs: string[];
  folderId?: string;
  secretPath?: string;
  isPaused?: boolean;
};

export type GetSecretVersionsDTO = {
  secretId: string;
  limit: number;
  offset: number;
};

export type TCreateSecretsV3DTO = {
  secretKey: string;
  secretValue: string;
  secretComment: string;
  skipMultilineEncoding?: boolean;
  secretPath: string;
  workspaceId: string;
  environment: string;
  type: SecretType;
};

export type TUpdateSecretsV3DTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  type: SecretType;
  skipMultilineEncoding?: boolean;
  newSecretName?: string;
  secretKey: string;
  secretValue: string;
  secretComment?: string;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  tagIds?: string[];
};

export type TDeleteSecretsV3DTO = {
  workspaceId: string;
  environment: string;
  type: SecretType;
  secretPath: string;
  secretKey: string;
  secretId?: string;
};

export type TCreateSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  secrets: Array<{
    secretKey: string;
    secretValue: string;
    secretComment: string;
    skipMultilineEncoding?: boolean;
    type: SecretType;
    tagIds?: string[];
    metadata?: {
      source?: string;
    };
  }>;
};

export type TUpdateSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  secrets: Array<{
    type: SecretType;
    secretKey: string;
    secretValue: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean;
    tagIds?: string[];
    metadata?: {
      source?: string;
    };
  }>;
};

export type TDeleteSecretBatchDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
  secrets: Array<{
    secretKey: string;
    type: SecretType;
  }>;
};

export type TMoveSecretsDTO = {
  projectSlug: string;
  projectId: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  secretIds: string[];
  shouldOverwrite: boolean;
};
