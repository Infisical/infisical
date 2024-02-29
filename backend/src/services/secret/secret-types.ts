import { Knex } from "knex";

import { SecretType, TSecretBlindIndexes, TSecrets, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

type TPartialSecret = Pick<TSecrets, "id" | "secretReminderRepeatDays" | "secretReminderNote">;

type TPartialInputSecret = Pick<TSecrets, "type" | "secretReminderNote" | "secretReminderRepeatDays" | "id">;

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
  includeImports?: boolean;
  overrideImports?: boolean;
} & TProjectPermission;

export type TGetASecretDTO = {
  secretName: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
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
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
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

export type TGetSecretsRawDTO = {
  path: string;
  environment: string;
  includeImports?: boolean;
} & TProjectPermission;

export type TGetASecretRawDTO = {
  secretName: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
} & TProjectPermission;

export type TCreateSecretRawDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  secretValue: string;
  type: SecretType;
  secretComment?: string;
  skipMultilineEncoding?: boolean;
};

export type TUpdateSecretRawDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  secretValue?: string;
  type: SecretType;
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
};

export type TDeleteSecretRawDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  type: SecretType;
};

export type TGetSecretVersionsDTO = Omit<TProjectPermission, "projectId"> & {
  limit?: number;
  offset?: number;
  secretId: string;
};

export type TFnSecretBulkInsert = {
  folderId: string;
  tx?: Knex;
  inputSecrets: Array<Omit<TSecretsInsert, "folderId"> & { tags?: string[] }>;
};

export type TFnSecretBulkUpdate = {
  folderId: string;
  projectId: string;
  inputSecrets: { filter: Partial<TSecrets>; data: TSecretsUpdate & { tags?: string[] } }[];
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

// when blind index is already present
export type TFnSecretBlindIndexCheckV2 = {
  folderId: string;
  userId?: string;
  inputSecrets: Array<{ secretBlindIndex: string; type?: SecretType }>;
};

export type THandleReminderDTO = {
  newSecret: TPartialInputSecret;
  oldSecret: TPartialSecret;
  projectId: string;
};

export type TCreateSecretReminderDTO = {
  oldSecret: TPartialSecret;
  newSecret: TPartialSecret;
  projectId: string;
};

export type TRemoveSecretReminderDTO = {
  secretId: string;
  repeatDays: number;
};
