import { Knex } from "knex";
import { z } from "zod";

import { SecretType, TSecretBlindIndexes, TSecrets, TSecretsInsert, TSecretsUpdate } from "@app/db/schemas";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TSecretDALFactory } from "@app/services/secret/secret-dal";
import { TSecretVersionDALFactory } from "@app/services/secret/secret-version-dal";
import { TSecretVersionTagDALFactory } from "@app/services/secret/secret-version-tag-dal";
import { TSecretBlindIndexDALFactory } from "@app/services/secret-blind-index/secret-blind-index-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { ActorType } from "../auth/auth-type";
import { TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { ResourceMetadataWithEncryptionDTO } from "../resource-metadata/resource-metadata-schema";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { SecretUpdateMode } from "../secret-v2-bridge/secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";

type TPartialSecret = Pick<TSecrets, "id" | "secretReminderRepeatDays" | "secretReminderNote"> & {
  secretReminderRecipients?: string[] | null;
};

type TPartialInputSecret = Pick<TSecrets, "type" | "secretReminderNote" | "secretReminderRepeatDays" | "id"> & {
  secretReminderRecipients?: string[] | null;
};

export const FailedIntegrationSyncEmailsPayloadSchema = z.object({
  projectId: z.string(),
  secretPath: z.string(),
  environmentName: z.string(),
  environmentSlug: z.string(),

  count: z.number(),
  syncMessage: z.string().optional(),
  manuallyTriggeredByUserId: z.string().optional()
});

export type TFailedIntegrationSyncEmailsPayload = z.infer<typeof FailedIntegrationSyncEmailsPayloadSchema>;

export type TIntegrationSyncPayload = {
  isManual?: boolean;
  actorId?: string;
  projectId: string;
  environment: string;
  secretPath: string;
  depth?: number;
  deDupeQueue?: Record<string, boolean>;
};

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
  skipMultilineEncoding?: boolean | null;
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
  skipMultilineEncoding?: boolean | null;
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
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TGetASecretDTO = {
  secretName: string;
  path: string;
  environment: string;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
} & TProjectPermission;

export type TGetASecretByIdDTO = {
  secretId: string;
} & Omit<TProjectPermission, "projectId">;

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
    skipMultilineEncoding?: boolean | null;
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
    skipMultilineEncoding?: boolean | null;
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

export enum SecretsOrderBy {
  Name = "name" // "key" for secrets but using name for use across resources
}

export type TGetAccessibleSecretsDTO = {
  secretPath: string;
  environment: string;
  recursive?: boolean;
  filterByAction: ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue;
} & TProjectPermission;

export type TGetSecretsRawDTO = {
  expandSecretReferences?: boolean;
  includePersonalOverrides?: boolean;
  path: string;
  environment: string;
  viewSecretValue: boolean;
  throwOnMissingReadValuePermission?: boolean;
  includeImports?: boolean;
  recursive?: boolean;
  tagSlugs?: string[];
  metadataFilter?: {
    key?: string;
    value?: string;
  }[];
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  offset?: number;
  limit?: number;
  search?: string;
  keys?: string[];
  includeTagsInSearch?: boolean;
  includeMetadataInSearch?: boolean;
  excludeRotatedSecrets?: boolean;
} & TProjectPermission;

export type TGetSecretAccessListDTO = {
  environment: string;
  secretPath: string;
  secretName: string;
} & TProjectPermission;

export type TGetASecretRawDTO = {
  secretName: string;
  path: string;
  environment: string;
  viewSecretValue: boolean;
  expandSecretReferences?: boolean;
  includePersonalOverrides?: boolean;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
  projectId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetASecretByIdRawDTO = {
  secretId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateSecretRawDTO = TProjectPermission & {
  secretName: string;
  secretPath: string;
  environment: string;
  secretValue: string;
  type: SecretType;
  tagIds?: string[];
  secretComment?: string;
  skipMultilineEncoding?: boolean | null;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  secretMetadata?: ResourceMetadataWithEncryptionDTO;
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
  skipMultilineEncoding?: boolean | null;
  secretReminderRepeatDays?: number | null;
  secretReminderNote?: string | null;
  secretReminderRecipients?: string[] | null;
  metadata?: {
    source?: string;
  };
  secretMetadata?: ResourceMetadataWithEncryptionDTO;
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
    skipMultilineEncoding?: boolean | null;
    tagIds?: string[];
    secretMetadata?: ResourceMetadataWithEncryptionDTO;
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
  mode: SecretUpdateMode;
  secrets: {
    secretKey: string;
    newSecretName?: string;
    secretValue?: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean | null;
    tagIds?: string[];
    secretMetadata?: ResourceMetadataWithEncryptionDTO;
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
    secretPath?: string;
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
  secretVersions?: string[];
};

export type TSecretReference = { environment: string; secretPath: string };

export type TFnSecretBulkInsert = {
  folderId: string;
  tx?: Knex;
  inputSecrets: Array<
    Omit<TSecretsInsert, "folderId"> & {
      tags?: string[];
      references?: TSecretReference[];
      secretMetadata?: ResourceMetadataWithEncryptionDTO;
    }
  >;
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
    removeSecretReminder: (data: TRemoveSecretReminderDTO, tx?: Knex) => Promise<void>;
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
  secretReminderRecipients: string[];

  deleteRecipients?: boolean;
};

export type TRemoveSecretReminderDTO = {
  secretId: string;
  repeatDays: number;
  projectId: string;
  deleteRecipients?: boolean;
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
    "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "bulkUpdate" | "deleteMany" | "find"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
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
    skipMultilineEncoding?: boolean | null;
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
    "insertMany" | "upsertSecretReferences" | "findBySecretKeys" | "bulkUpdate" | "deleteMany" | "find"
  >;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretVersionTagV2BridgeDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
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
    skipMultilineEncoding?: boolean | null;
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
  orgId: string;
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
  projectId?: string;
  projectSlug?: string;
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

export type TProcessNewCommitRawDTO = {
  secrets: {
    create?: {
      secretKey: string;
      secretValue: string;
      secretComment?: string;
      skipMultilineEncoding?: boolean | null;
      tagIds?: string[];
      secretMetadata?: ResourceMetadataWithEncryptionDTO;
      metadata?: { source?: string };
    }[];
    update?: {
      secretKey: string;
      newSecretName?: string;
      secretValue?: string;
      secretComment?: string;
      skipMultilineEncoding?: boolean | null;
      tagIds?: string[];
      secretMetadata?: ResourceMetadataWithEncryptionDTO;
      metadata?: { source?: string };
    }[];
    delete?: { secretKey: string }[];
  };
  folders: {
    create?: { folderName: string; description?: string }[];
    update?: { folderName: string; description?: string | null; id: string }[];
    delete?: { folderName: string; id: string }[];
  };
};
