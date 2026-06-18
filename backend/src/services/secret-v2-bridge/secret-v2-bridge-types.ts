import { MongoAbility } from "@casl/ability";
import { Knex } from "knex";

import { SecretType, TSecretsV2, TSecretsV2Insert, TSecretsV2Update } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionSecretActions, ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import {
  PersonalOverridesBehavior,
  SecretImportReferencesBehavior,
  SecretsOrderBy
} from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretTagDALFactory } from "@app/services/secret-tag/secret-tag-dal";

import { TCommitResourceChangeDTO, TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TReminderDALFactory } from "../reminder/reminder-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { ResourceMetadataWithEncryptionDTO } from "../resource-metadata/resource-metadata-schema";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "./secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "./secret-version-tag-dal";

type TPartialSecret = Pick<TSecretsV2, "id" | "reminderRepeatDays" | "reminderNote">;

type TPartialInputSecret = Pick<TSecretsV2, "type" | "reminderNote" | "reminderRepeatDays" | "id">;

export type TSecretReferenceDTO = {
  environment: string;
  secretPath: string;
  secretKey: string;
};

export enum SecretUpdateMode {
  Ignore = "ignore",
  Upsert = "upsert",
  FailOnNotFound = "failOnNotFound"
}

export type TGetSecretsDTO = {
  expandSecretReferences?: boolean;
  personalOverridesBehavior: PersonalOverridesBehavior;
  secretImportReferencesBehavior: SecretImportReferencesBehavior;
  expandPersonalOverrides?: boolean;
  path: string;
  environment: string;
  includeImports?: boolean;
  recursive?: boolean;
  tagSlugs?: string[];
  viewSecretValue: boolean;
  throwOnMissingReadValuePermission?: boolean;
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
  excludeRotatedSecrets?: boolean;
  ifNoneMatch?: string;
} & TProjectPermission;

export type TGetSecretsMissingReadValuePermissionDTO = Omit<
  TGetSecretsDTO,
  "viewSecretValue" | "recursive" | "expandSecretReferences"
>;

export type TGetASecretDTO = {
  secretName: string;
  path: string;
  environment: string;
  expandSecretReferences?: boolean;
  expandPersonalOverrides?: boolean;
  type: "shared" | "personal";
  includeImports?: boolean;
  version?: number;
  projectId: string;
  viewSecretValue: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TCreateSecretDTO = TProjectPermission & {
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

export type TUpdateSecretDTO = TProjectPermission & {
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

export type TDeleteSecretDTO = TProjectPermission & {
  secretPath: string;
  environment: string;
  secretName: string;
  type: SecretType;
};

export type TCreateManySecretDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId: string;
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

export type TUpdateManySecretDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId: string;
  environment: string;
  mode: SecretUpdateMode;
  secrets: {
    secretKey: string;
    newSecretName?: string;
    secretValue?: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean | null;
    tagIds?: string[];
    secretReminderRepeatDays?: number | null;
    secretReminderNote?: string | null;
    secretMetadata?: ResourceMetadataWithEncryptionDTO;
    secretPath?: string;
  }[];
};

export type TDeleteManySecretDTO = Omit<TProjectPermission, "projectId"> & {
  secretPath: string;
  projectId: string;
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

export type TSecretReference = { environment: string; secretPath: string; secretKey: string };

export type TFnSecretBulkInsert = {
  folderId: string;
  orgId: string;
  tx?: Knex;
  commitChanges?: TCommitResourceChangeDTO[];
  inputSecrets: Array<
    Omit<TSecretsV2Insert, "folderId" | "metadata"> & {
      tagIds?: string[];
      references: TSecretReference[];
      secretMetadata?: { key: string; value?: string | null; encryptedValue?: Buffer | null }[];
      parentSecretVersionId?: string;
      secretValueBlindIndex?: string | null;
    }
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany">;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "insertMany" | "upsertSecretReferences" | "find">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  actor?: {
    type: string;
    actorId?: string;
  };
};

type TRequireReferenceIfValue =
  | (Omit<TSecretsV2Update, "encryptedValue" | "metadata"> & {
      encryptedValue: Buffer | null;
      references: TSecretReference[];
      secretValueBlindIndex?: string | null;
    })
  | (Omit<TSecretsV2Update, "encryptedValue" | "metadata"> & {
      encryptedValue?: never;
      references?: never;
      secretValueBlindIndex?: never;
    });

export type TFnSecretBulkUpdate = {
  folderId: string;
  orgId: string;
  inputSecrets: {
    filter: Partial<TSecretsV2>;
    data: TRequireReferenceIfValue & {
      tags?: string[];
      secretMetadata?: { key: string; value?: string | null; encryptedValue?: Buffer | null }[];
      parentSecretVersionId?: string;
    };
  }[];
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "bulkUpdate" | "upsertSecretReferences" | "find"> &
    Partial<Pick<TSecretV2BridgeDALFactory, "bulkUpdateById">>;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  actor?: {
    type: string;
    actorId?: string;
  };
  tx?: Knex;
  commitChanges?: TCommitResourceChangeDTO[];
};

export type TFnSecretBulkDelete = {
  folderId: string;
  projectId: string;
  inputSecrets: Array<{ type: SecretType; secretKey: string }>;
  actorId: string;
  actorType?: string;
  tx?: Knex;
  commitChanges?: TCommitResourceChangeDTO[];
  secretDAL: Pick<TSecretV2BridgeDALFactory, "deleteMany">;
  secretQueueService: {
    removeSecretReminder: (data: TRemoveSecretReminderDTO, tx?: Knex) => Promise<void>;
  };
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionMany">;
};

// a source/destination folder resolved by folderDAL.findBySecretPath (carries id, path and environment)
export type TMoveSecretResolvedFolder = NonNullable<Awaited<ReturnType<TSecretFolderDALFactory["findBySecretPath"]>>>;

// performs the two-step move (create/update at destination + delete at source) inside the caller-supplied
// transaction. does no snapshot/sync/cache-invalidation — the caller runs those after the tx commits.
export type TFnSecretMove = {
  projectId: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  secretIds: string[];
  shouldOverwrite: boolean;
  actor: ActorType;
  actorId: string;
  actorOrgId: string;
  permission: MongoAbility<ProjectPermissionSet>;
  tx: Knex;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath" | "findSecretPathByFolderIds">;
  secretDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "find"
    | "findOne"
    | "delete"
    | "insertMany"
    | "bulkUpdate"
    | "bulkUpdateById"
    | "upsertSecretReferences"
    | "updateById"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceEnvAndPath"
  >;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertV2Bridge" | "insertApprovalSecretV2Tags"
  >;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
  reminderDAL: Pick<TReminderDALFactory, "findSecretReminders" | "delete">;
  reminderService: Pick<TReminderServiceFactory, "batchCreateReminders">;
};

export type TFnSecretMoveResult = {
  isSourceUpdated: boolean;
  isDestinationUpdated: boolean;
  sourceFolder: TMoveSecretResolvedFolder;
  destinationFolder: TMoveSecretResolvedFolder;
};

export type TFnSecretMoveInTransaction = Omit<TFnSecretMove, "permission"> & {
  actorAuthMethod: ActorAuthMethod;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

// post-commit side effects for a single move: snapshot + sync the affected source/destination folders.
// skipSourceSnapshot is set by callers (e.g. folder move) that have already deleted the source folder, so
// snapshotting it would just fail with NotFoundError; the source sync still runs to notify secret imports.
export type TDispatchSecretMoveSideEffectsDTO = {
  projectId: string;
  orgId: string;
  actor: ActorType;
  actorId: string;
  skipSourceSnapshot?: boolean;
} & TFnSecretMoveResult;

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
  projectId: string;
};

export type TBackFillSecretReferencesDTO = TProjectPermission;

export type TCreateManySecretsFnFactory = {
  projectDAL: TProjectDALFactory;
  secretDAL: TSecretV2BridgeDALFactory;
  secretVersionDAL: TSecretVersionV2DALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionV2TagDALFactory;
  folderDAL: TSecretFolderDALFactory;
};

export type TCreateManySecretsFn = {
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

export type TUpdateManySecretsFnFactory = {
  projectDAL: TProjectDALFactory;
  secretDAL: TSecretV2BridgeDALFactory;
  secretVersionDAL: TSecretVersionV2DALFactory;
  secretTagDAL: TSecretTagDALFactory;
  secretVersionTagDAL: TSecretVersionV2TagDALFactory;
  folderDAL: TSecretFolderDALFactory;
};

export type TFindByFolderIdDALDTO = {
  folderId: string;
  userId?: string;
  tx?: Knex;
  projectId: string;
};

export type TUpdateManySecretsFn = {
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

export type TMoveSecretsDTO = {
  projectId: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  secretIds: string[];
  shouldOverwrite: boolean;
} & Omit<TProjectPermission, "projectId">;

export type TDuplicateSecretAttributes = {
  value?: boolean;
  comment?: boolean;
  tags?: boolean;
  metadata?: boolean;
  skipMultilineEncoding?: boolean;
};

export type TDuplicateSecretDTO = {
  projectId: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  secretIds: string[];
  shouldOverwrite: boolean;
  attributesToCopy: TDuplicateSecretAttributes;
} & Omit<TProjectPermission, "projectId">;

export type TAttachSecretTagsDTO = {
  projectId: string;
  secretName: string;
  tagSlugs: string[];
  environment: string;
  secretPath: string;
  type: SecretType;
} & Omit<TProjectPermission, "projectId">;

export type TGetSecretReferencesTreeDTO = {
  projectId: string;
  secretName: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetSecretReferencesDTO = {
  projectId: string;
  secretName: string;
  environment: string;
  secretPath: string;
} & Omit<TProjectPermission, "projectId">;

export type TFindSecretsByFolderIdsFilter = {
  limit?: number;
  offset?: number;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
  tagSlugs?: string[];
  metadataFilter?: { key?: string; value?: string }[];
  includeTagsInSearch?: boolean;
  includeMetadataInSearch?: boolean;
  keys?: string[];
  excludeRotatedSecrets?: boolean;
};

export type TGetSecretsRawByFolderMappingsDTO = {
  projectId: string;
  folderMappings: { folderId: string; path: string; environment: string }[];
  userId: string;
  filters: TFindSecretsByFolderIdsFilter;
  filterByAction?: ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue;
};

export type TGetAccessibleSecretsDTO = {
  environment: string;
  projectId: string;
  secretPath: string;
  recursive?: boolean;
  filterByAction: ProjectPermissionSecretActions.DescribeSecret | ProjectPermissionSecretActions.ReadValue;
} & TProjectPermission;

export type TUpdateLinkedSecretReferencesDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  folderId: string;
  secretId: string;
  oldSecretKey: string;
  newSecretKey: string;
};
