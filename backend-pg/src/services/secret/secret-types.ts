import { Knex } from "knex";

import { SecretType, TSecretBlindIndexes, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TCreateSecretDTO = {
  secretName: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  tags?: string[];
  metadata?: {
    source?: string;
  };
} & TProjectPermission;

export type TUpdateSecretDTO = {
  secretName: string;
  path: string;
  newSecretName?: string;
  environment: string;
  type: "shared" | "personal";
  secretKeyCiphertext?: string;
  secretKeyIV?: string;
  secretKeyTag?: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  tags?: string[];
  secretCommentCiphertext?: string;
  secretCommentIV?: string;
  secretCommentTag?: string;
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  metadata?: {
    source?: string;
  };
} & TProjectPermission;

export type TDeleteSecretDTO = {
  secretName: string;
  secretId?: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
} & TProjectPermission;

export type TGetSecretsDTO = {
  path: string;
  environment: string;
} & TProjectPermission;

export type TGetASecretDTO = {
  secretName: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
} & TProjectPermission;

export type TCreateBulkSecretDTO = {
  path: string;
  environment: string;
  secrets: Array<{
    secretName: string;
    secretKeyCiphertext: string;
    secretKeyIV: string;
    secretKeyTag: string;
    secretValueCiphertext: string;
    secretValueIV: string;
    tags?: string[];
    secretValueTag: string;
    secretCommentCiphertext?: string;
    secretCommentIV?: string;
    secretCommentTag?: string;
    skipMultilineEncoding?: boolean;
    metadata?: {
      source?: string;
    };
  }>;
} & TProjectPermission;

export type TUpdateBulkSecretDTO = {
  path: string;
  environment: string;
  secrets: Array<{
    type: SecretType;
    secretName: string;
    newSecretName?: string;
    secretValueCiphertext?: string;
    secretValueIV?: string;
    secretValueTag?: string;
    tags?: string[];
    secretCommentCiphertext?: string;
    secretCommentIV?: string;
    secretCommentTag?: string;
    skipMultilineEncoding?: boolean;
  }>;
} & TProjectPermission;

export type TDeleteBulkSecretDTO = {
  path: string;
  environment: string;
  secrets: Array<{
    type: SecretType;
    secretName: string;
  }>;
} & TProjectPermission;

export type TListSecretVersionDTO = {
  secretId: string;
  offset?: number;
  limit?: number;
} & Omit<TProjectPermission, "projectId">;

export type TFnSecretBulkInsert = {
  folderId: string;
  tx?: Knex;
  inputSecrets: Array<Omit<TSecretsInsert, "folderId"> & { tags?: string[] }>;
};

export type TFnSecretBulkUpdate = {
  folderId: string;
  projectId: string;
  inputSecrets: Array<TSecretsUpdate & { tags?: string[]; id: string }>;
  tx?: Knex;
};

export type TFnSecretBulkDelete = {
  folderId: string;
  projectId: string;
  inputSecrets: Array<{ type: SecretType; secretBlindIndex: string }>;
  actorId: string;
  tx?: Knex;
};

export type TFnSecretBlindIndexCheck = {
  folderId: string;
  userId?: string;
  blindIndexCfg: TSecretBlindIndexes;
  inputSecrets: Array<{ secretName: string; type?: SecretType }>;
  isNew: boolean;
};
