import { Knex } from "knex";

import { SecretType, TSecretBlindIndexes, TSecrets, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { ActorType } from "../auth/auth-type";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";

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
  recursive?: boolean;
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
  expandSecretReferences?: boolean;
  path: string;
  environment: string;
  includeImports?: boolean;
  recursive?: boolean;
} & TProjectPermission;

export type TGetASecretRawDTO = {
  secretName: string;
  path: string;
  environment: string;
  expandSecretReferences?: boolean;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
  projectSlug?: string;
  projectId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateSecretRawDTO = TProjectPermission & {
  secretName: string;
  secretPath: string;
  environment: string;
  secretValue: string;
  type: SecretType;
  tagIds?: string[];
  secretComment?: string;
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
};

export type TUpdateSecretRawDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  secretValue?: string;
  newSecretName?: string;
  secretComment?: string;
  type: SecretType;
  tagIds?: string[];
  skipMultilineEncoding?: boolean;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  metadata?: {
    source?: string;
  };
};

export type TDeleteSecretRawDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  type: SecretType;
};

export type TCreateManySecretRawDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId?: string;
  projectSlug?: string;
  environment: string;
  secrets: {
    secretKey: string;
    secretValue: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean;
    tagIds?: string[];
    metadata?: {
      source?: string;
    };
  }[];
};

export type TUpdateManySecretRawDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId?: string;
  projectSlug?: string;
  environment: string;
  secrets: {
    secretKey: string;
    newSecretName?: string;
    secretValue: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean;
    tagIds?: string[];
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
  }[];
};

export type TDeleteManySecretRawDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId?: string;
  projectSlug?: string;
  environment: string;
  secrets: {
    secretKey: string;
    type?: SecretType;
  }[];
};

export type TGetSecretVersionsDTO = Omit<TProjectPermission, "projectId"> & {
  limit?: number;
  offset?: number;
  secretId: string;
};

export type TSecretReference = { environment: string; secretPath: string };

export type TFnSecretBulkInsert = {
  folderId: string;
  tx?: Knex;
  inputSecrets: Array<Omit<TSecretsInsert, "folderId"> & { tags?: string[]; references?: TSecretReference[] }>;
  secretDAL: Pick<TSecretDALFactory, "insertMany" | "upsertSecretReferences">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecret">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
};

export type TFnSecretBulkUpdate = {
  folderId: string;
  projectId: string;
  inputSecrets: {
    filter: Partial<TSecrets>;
    data: TSecretsUpdate & { tags?: string[]; references?: TSecretReference[] };
  }[];
  secretDAL: Pick<TSecretDALFactory, "bulkUpdate" | "upsertSecretReferences">;
  secretVersionDAL: Pick<TSecretVersionDALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecret" | "deleteTagsManySecret">;
  secretVersionTagDAL: Pick<TSecretVersionTagDALFactory, "insertMany">;
  tx?: Knex;
};

export type TAttachSecretTagsDTO = {
  projectSlug: string;
  secretName: string;
  tagSlugs: string[];
  environment: string;
  path: string;
  type: SecretType;
} & Omit<TProjectPermission, "projectId">;

export type TFnSecretBulkDelete = {
  folderId: string;
  projectId: string;
  inputSecrets: Array<{ type: SecretType; secretBlindIndex: string }>;
  actorId: string;
  tx?: Knex;
  secretDAL: Pick<TSecretDALFactory, "deleteMany">;
  secretQueueService: {
    removeSecretReminder: (data: TRemoveSecretReminderDTO) => Promise<void>;
  };
};

export type TFnSecretBlindIndexCheck = {
  folderId: string;
  userId?: string;
  blindIndexCfg: TSecretBlindIndexes;
  inputSecrets: Array<{ secretName: string; type?: SecretType }>;
  isNew: boolean;
  secretDAL: Pick<TSecretDALFactory, "findByBlindIndexes">;
};

// when blind index is already present
export type TFnSecretBlindIndexCheckV2 = {
  secretDAL: Pick<TSecretDALFactory, "findByBlindIndexes">;
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

export type TBackFillSecretReferencesDTO = TProjectPermission;

// ---

export type TCreateManySecretsRawFnFactory = {
  projectDAL: TProjectDALFactory;
  projectBotDAL: TProjectBotDALFactory;
  secretDAL: TSecretDALFactory;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
  folderDAL: TSecretFolderDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "bulkUpdate" | "deleteMany"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
};

export type TCreateManySecretsRawFn = {
  projectId: string;
  environment: string;
  path: string;
  secrets: {
    secretName: string;
    secretValue: string;
    type: SecretType;
    secretComment?: string;
    skipMultilineEncoding?: boolean;
    tags?: string[];
    metadata?: {
      source?: string;
    };
  }[];
  userId?: string; // only relevant for personal secret(s)
};

export type TUpdateManySecretsRawFnFactory = {
  projectDAL: TProjectDALFactory;
  projectBotDAL: TProjectBotDALFactory;
  secretDAL: TSecretDALFactory;
  secretVersionDAL: TSecretVersionDALFactory;
  secretBlindIndexDAL: TSecretBlindIndexDALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionTagDALFactory;
  folderDAL: TSecretFolderDALFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "bulkUpdate" | "deleteMany"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
};

export type TUpdateManySecretsRawFn = {
  projectId: string;
  environment: string;
  path: string;
  secrets: {
    secretName: string;
    newSecretName?: string;
    secretValue: string;
    type: SecretType;
    secretComment?: string;
    skipMultilineEncoding?: boolean;
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
    tags?: string[];
    metadata?: {
      source?: string;
    };
  }[];
  userId?: string;
};

export enum SecretOperations {
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export type TSyncSecretsDTO<T extends boolean = false> = {
  _deDupeQueue?: Record<string, boolean>;
  _deDupeReplicationQueue?: Record<string, boolean>;
  _depth?: number;
  secretPath: string;
  projectId: string;
  environmentSlug: string;
  // cases for just doing sync integration and webhook
  excludeReplication?: T;
} & (T extends true
  ? object
  : {
      actor: ActorType;
      actorId: string;
      // used for import creation to trigger replication
      pickOnlyImportIds?: string[];
    });

export type TMoveSecretsDTO = {
  projectSlug: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  secretIds: string[];
  shouldOverwrite: boolean;
} & Omit<TProjectPermission, "projectId">;

export enum SecretProtectionType {
  Approval = "approval",
  Direct = "direct"
}

export type TStartSecretsV2MigrationDTO = TProjectPermission;
