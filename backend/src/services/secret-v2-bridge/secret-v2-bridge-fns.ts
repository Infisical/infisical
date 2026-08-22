import path from "node:path";

import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";
import RE2 from "re2";

import {
  ActionProjectType,
  SecretType,
  TableName,
  TSecretFolders,
  TSecretImports,
  TSecretsV2,
  TSecretVersionsV2
} from "@app/db/schemas";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { ProjectPermissionSecretActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import {
  InternalMetadataType,
  TInternalMetadata
} from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { ActorType } from "../auth/auth-type";
import { CommitType, TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { ResourceMetadataWithEncryptionDTO } from "../resource-metadata/resource-metadata-schema";
import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "../secret/secret-fns";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretReminderRecipient } from "../secret-reminder-recipients/secret-reminder-recipients-types";
import { expandSecretReferencesFactory, getAllSecretReferences } from "./secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import {
  SecretOperations,
  TFnSecretBulkDelete,
  TFnSecretBulkInsert,
  TFnSecretBulkUpdate,
  TFnSecretMove,
  TFnSecretMoveInTransaction,
  TFnSecretMoveResult
} from "./secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "./secret-version-dal";

export const shouldUseSecretV2Bridge = (version: number) => version === 3;

const BULK_BATCH_SIZE = 500;

const RESERVED_REPLICATION_IMPORT_REGEX = new RE2("/__reserve_replication_([a-f0-9-]{36})");

// these functions are special functions shared by a couple of resources
// used by secret approval, rotation or anywhere in which secret needs to modified
export const fnSecretBulkInsert = async ({
  // TODO: Pick types here
  folderId,
  commitChanges,
  orgId,
  inputSecrets,
  secretDAL,
  secretVersionDAL,
  resourceMetadataDAL,
  secretTagDAL,
  secretVersionTagDAL,
  folderCommitService,
  actor,
  tx
}: TFnSecretBulkInsert) => {
  const sanitizedInputSecrets = inputSecrets.map(
    ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      secretValueBlindIndex
    }) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays,
      secretValueBlindIndex
    })
  );

  const userActorId = actor && actor.type === ActorType.USER ? actor.actorId : undefined;
  const identityActorId = actor && actor.type === ActorType.IDENTITY ? actor.actorId : undefined;
  const actorType = actor?.type || ActorType.PLATFORM;

  const insertData = sanitizedInputSecrets.map((el) => ({ ...el, folderId }));
  const newSecrets: TSecretsV2[] = [];
  for (let i = 0; i < insertData.length; i += BULK_BATCH_SIZE) {
    const batch = insertData.slice(i, i + BULK_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const batchResult = await secretDAL.insertMany(batch, tx);
    newSecrets.push(...batchResult);
  }

  const newSecretGroupedByKeyName = groupBy(newSecrets, (item) => item.key);
  const newSecretTags = inputSecrets.flatMap(({ tagIds: secretTags = [], key }) =>
    secretTags.map((tag) => ({
      [`${TableName.SecretTag}Id` as const]: tag,
      [`${TableName.SecretV2}Id` as const]: newSecretGroupedByKeyName[key][0].id
    }))
  );

  const versionData = sanitizedInputSecrets.map((el, index) => ({
    ...el,
    folderId,
    userActorId,
    identityActorId,
    actorType,
    metadata: inputSecrets?.[index]?.secretMetadata
      ? JSON.stringify(
          inputSecrets?.[index]?.secretMetadata?.map((meta) => ({
            key: meta.key,
            value: meta?.value,
            encryptedValue: meta?.encryptedValue?.toString("base64")
          }))
        )
      : null,
    secretId: newSecretGroupedByKeyName[el.key][0].id,
    parentVersionId: inputSecrets?.[index]?.parentSecretVersionId
  }));
  const secretVersions: TSecretVersionsV2[] = [];
  for (let i = 0; i < versionData.length; i += BULK_BATCH_SIZE) {
    const batch = versionData.slice(i, i + BULK_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const batchResult = await secretVersionDAL.insertMany(batch, tx);
    secretVersions.push(...batchResult);
  }

  const changes = secretVersions
    .filter(({ type }) => type === SecretType.Shared)
    .map((sv) => ({
      type: CommitType.ADD,
      secretVersionId: sv.id
    }));

  if (changes.length > 0) {
    if (commitChanges) {
      commitChanges.push(...changes);
    } else {
      await folderCommitService.createCommit(
        {
          actor: {
            type: actorType || ActorType.PLATFORM,
            metadata: {
              id: actor?.actorId
            }
          },
          message: "Secret Created",
          folderId,
          changes
        },
        tx
      );
    }
  }

  await secretDAL.upsertSecretReferences(
    inputSecrets.map(({ references = [], key }) => ({
      secretId: newSecretGroupedByKeyName[key][0].id,
      references
    })),
    tx
  );

  await resourceMetadataDAL.insertMany(
    inputSecrets.flatMap(({ key: secretKey, secretMetadata }) => {
      if (secretMetadata) {
        return secretMetadata.map(({ key, value, encryptedValue }) => ({
          key,
          value,
          encryptedValue,
          secretId: newSecretGroupedByKeyName[secretKey][0].id,
          orgId
        }));
      }
      return [];
    }),
    tx
  );

  if (newSecretTags.length) {
    const secTags = await secretTagDAL.saveTagsToSecretV2(newSecretTags, tx);
    const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);

    const newSecretVersionTags = secTags.flatMap(({ secrets_v2Id, secret_tagsId }) => ({
      [`${TableName.SecretVersionV2}Id` as const]: secVersionsGroupBySecId[secrets_v2Id][0].id,
      [`${TableName.SecretTag}Id` as const]: secret_tagsId
    }));

    await secretVersionTagDAL.insertMany(newSecretVersionTags, tx);
  }

  const secretsWithTags = await secretDAL.find(
    {
      $in: {
        [`${TableName.SecretV2}.id` as "id"]: newSecrets.map((s) => s.id)
      }
    },
    { tx }
  );

  return secretsWithTags.map((secret) => ({ ...secret, _id: secret.id }));
};

export const fnSecretBulkUpdate = async ({
  tx,
  inputSecrets,
  folderId,
  commitChanges,
  orgId,
  secretDAL,
  secretVersionDAL,
  folderCommitService,
  secretTagDAL,
  secretVersionTagDAL,
  resourceMetadataDAL,
  actor
}: TFnSecretBulkUpdate) => {
  const userActorId = actor && actor?.type === ActorType.USER ? actor?.actorId : undefined;
  const identityActorId = actor && actor?.type === ActorType.IDENTITY ? actor?.actorId : undefined;
  const actorType = actor?.type || ActorType.PLATFORM;

  const sanitizedInputSecrets = inputSecrets.map(
    ({
      filter,
      data: { skipMultilineEncoding, type, key, encryptedValue, userId, encryptedComment, secretValueBlindIndex }
    }) => ({
      filter: { ...filter, folderId },
      data: {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        encryptedValue,
        secretValueBlindIndex
      }
    })
  );

  // const allHaveIds = sanitizedInputSecrets.every((s): s is typeof s & { filter: { id: string } } => !!s.filter.id);
  const newSecrets = await secretDAL.bulkUpdate(sanitizedInputSecrets, tx);
  const versionData = newSecrets.map(
    (
      {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        version,
        encryptedValue,
        secretValueBlindIndex,
        id: secretId
      },
      index
    ) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      metadata:
        JSON.stringify(
          inputSecrets?.[index]?.data?.secretMetadata?.map((meta) => ({
            key: meta.key,
            value: meta?.value,
            encryptedValue: meta?.encryptedValue?.toString("base64")
          }))
        ) || null,
      encryptedValue,
      secretValueBlindIndex,
      folderId,
      secretId,
      userActorId,
      identityActorId,
      actorType,
      parentVersionId: inputSecrets?.[index]?.data?.parentSecretVersionId
    })
  );
  const secretVersions: TSecretVersionsV2[] = [];
  for (let i = 0; i < versionData.length; i += BULK_BATCH_SIZE) {
    const batch = versionData.slice(i, i + BULK_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const batchResult = await secretVersionDAL.insertMany(batch, tx);
    secretVersions.push(...batchResult);
  }

  await secretDAL.upsertSecretReferences(
    inputSecrets
      .filter(({ data: { references } }) => Boolean(references))
      .map(({ data: { references = [] } }, i) => ({
        secretId: newSecrets[i].id,
        references
      })),
    tx
  );
  const secsUpdatedTag = inputSecrets.flatMap(({ data: { tags } }, i) =>
    tags !== undefined ? { tags, secretId: newSecrets[i].id } : []
  );

  if (secsUpdatedTag.length) {
    await secretTagDAL.deleteTagsToSecretV2(
      { $in: { secrets_v2Id: secsUpdatedTag.map(({ secretId }) => secretId) } },
      tx
    );
    const newSecretTags = secsUpdatedTag.flatMap(({ tags: secretTags = [], secretId }) =>
      secretTags.map((tag) => ({
        [`${TableName.SecretTag}Id` as const]: tag,
        [`${TableName.SecretV2}Id` as const]: secretId
      }))
    );
    if (newSecretTags.length) {
      const secTags = await secretTagDAL.saveTagsToSecretV2(newSecretTags, tx);
      const secVersionsGroupBySecId = groupBy(secretVersions, (i) => i.secretId);
      const newSecretVersionTags = secTags.flatMap(({ secrets_v2Id, secret_tagsId }) => ({
        [`${TableName.SecretVersionV2}Id` as const]: secVersionsGroupBySecId[secrets_v2Id][0].id,
        [`${TableName.SecretTag}Id` as const]: secret_tagsId
      }));
      await secretVersionTagDAL.insertMany(newSecretVersionTags, tx);
    }
  }

  const inputSecretIdsWithMetadata = inputSecrets
    .filter((sec) => Boolean(sec.data.secretMetadata))
    .map((sec) => sec.filter.id);

  await resourceMetadataDAL.delete(
    {
      $in: {
        secretId: inputSecretIdsWithMetadata
      }
    },
    tx
  );

  await resourceMetadataDAL.insertMany(
    inputSecrets.flatMap(({ filter: { id }, data: { secretMetadata } }) => {
      if (secretMetadata) {
        return secretMetadata.map(({ key, value, encryptedValue }) => ({
          key,
          value,
          encryptedValue,
          secretId: id,
          orgId
        }));
      }
      return [];
    }),
    tx
  );

  const secretsWithTags = await secretDAL.find(
    {
      $in: {
        [`${TableName.SecretV2}.id` as "id"]: newSecrets.map((s) => s.id)
      }
    },
    { tx }
  );

  const changes = secretVersions
    .filter(({ type }) => type === SecretType.Shared)
    .map((sv) => ({
      type: CommitType.ADD,
      isUpdate: true,
      secretVersionId: sv.id
    }));
  if (changes.length > 0) {
    if (commitChanges) {
      commitChanges.push(...changes);
    } else {
      await folderCommitService.createCommit(
        {
          actor: {
            type: actorType || ActorType.PLATFORM,
            metadata: {
              id: actor?.actorId
            }
          },
          message: "Secret Updated",
          folderId,
          changes
        },
        tx
      );
    }
  }

  return secretsWithTags.map((secret) => ({ ...secret, _id: secret.id }));
};

export const fnSecretBulkDelete = async ({
  folderId,
  inputSecrets,
  tx,
  actorId,
  actorType,
  secretDAL,
  secretQueueService,
  folderCommitService,
  secretVersionDAL,
  projectId,
  commitChanges
}: TFnSecretBulkDelete) => {
  const deletedSecrets = await secretDAL.deleteMany(
    inputSecrets.map(({ type, secretKey }) => ({
      key: secretKey,
      type
    })),
    folderId,
    actorId,
    tx
  );

  await Promise.all(
    deletedSecrets
      .filter(({ reminderRepeatDays }) => Boolean(reminderRepeatDays))
      .map(({ id, reminderRepeatDays }) =>
        secretQueueService.removeSecretReminder(
          { secretId: id, repeatDays: reminderRepeatDays as number, projectId },
          tx
        )
      )
  );

  const secretVersions = await secretVersionDAL.findLatestVersionMany(
    folderId,
    deletedSecrets.map(({ id }) => id),
    tx
  );

  const changes = deletedSecrets
    .filter(({ type, id }) => type === SecretType.Shared && secretVersions[id])
    .map(({ id }) => ({
      type: CommitType.DELETE,
      secretVersionId: secretVersions[id]?.id
    }));

  if (changes.length > 0) {
    if (commitChanges) {
      commitChanges.push(...changes);
    } else {
      await folderCommitService.createCommit(
        {
          actor: {
            type: actorType || ActorType.PLATFORM,
            metadata: {
              id: actorId
            }
          },
          message: "Secret Deleted",
          folderId,
          changes
        },
        tx
      );
    }
  }

  return deletedSecrets;
};

// Introduce a new interface for mapping parent IDs to their children
interface FolderMap {
  [parentId: string]: TSecretFolders[];
}
export const buildHierarchy = (folders: TSecretFolders[]): FolderMap => {
  const map: FolderMap = {};
  map.null = []; // Initialize mapping for root directory

  folders.forEach((folder) => {
    const parentId = folder.parentId || "null";
    if (!map[parentId]) {
      map[parentId] = [];
    }
    map[parentId].push(folder);
  });

  return map;
};

export const generatePaths = (
  map: FolderMap,
  parentId: string = "null",
  basePath: string = "",
  currentDepth: number = 0
): { path: string; folderId: string }[] => {
  const children = map[parentId || "null"] || [];
  let paths: { path: string; folderId: string }[] = [];

  children.forEach((child) => {
    // Determine if this is the root folder of the environment. If no parentId is present and the name is root, it's the root folder
    const isRootFolder = child.name === "root" && !child.parentId;

    // Form the current path based on the base path and the current child
    // eslint-disable-next-line no-nested-ternary
    const currPath = basePath === "" ? (isRootFolder ? "/" : `/${child.name}`) : `${basePath}/${child.name}`;

    // Add the current path
    paths.push({
      path: currPath,
      folderId: child.id
    });

    // We make sure that the recursion depth doesn't exceed 20.
    // We do this to create "circuit break", basically to ensure that we can't encounter any potential memory leaks.
    if (currentDepth >= 20) {
      logger.info(`generatePaths: Recursion depth exceeded 20, breaking out of recursion [map=${JSON.stringify(map)}]`);
      return;
    }
    // Recursively generate paths for children, passing down the formatted path
    const childPaths = generatePaths(map, child.id, currPath, currentDepth + 1);
    paths = paths.concat(
      childPaths.map((p) => ({
        path: p.path,
        folderId: p.folderId
      }))
    );
  });

  return paths;
};

type TRecursivelyFetchSecretsFromFoldersArg = {
  folderDAL: Pick<TSecretFolderDALFactory, "find">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectId: string;
  environment: string;
  currentPath: string;
};

export const recursivelyGetSecretPaths = async ({
  folderDAL,
  projectEnvDAL,
  projectId,
  environment,
  currentPath
}: TRecursivelyFetchSecretsFromFoldersArg) => {
  const env = await projectEnvDAL.findOne({
    projectId,
    slug: environment
  });

  if (!env) {
    throw new NotFoundError({
      message: `Environment with slug '${environment}' in project with ID ${projectId} not found`
    });
  }

  // Fetch all folders in env once with a single query
  const folders = await folderDAL.find({
    envId: env.id,
    isReserved: false
  });

  // Build the folder hierarchy map
  const folderMap = buildHierarchy(folders);

  // Generate the paths paths and normalize the root path to /
  const paths = generatePaths(folderMap).map((p) => ({
    path: p.path === "/" ? p.path : p.path.substring(1),
    folderId: p.folderId
  }));

  // path relative will start with ../ if its outside directory
  const pathsInCurrentDirectory = paths.filter((folder) => !path.relative(currentPath, folder.path).startsWith(".."));

  return pathsInCurrentDirectory;
};

export type TSecretReferenceTraceNode = {
  key: string;
  value?: string;
  environment: string;
  secretPath: string;
  children: TSecretReferenceTraceNode[];
};

export const reshapeBridgeSecret = (
  projectId: string,
  environment: string,
  secretPath: string,
  secret: Omit<TSecretsV2, "encryptedValue" | "encryptedComment"> & {
    value: string;
    comment: string;
    userActorName?: string | null;
    identityActorName?: string | null;
    userActorId?: string | null;
    identityActorId?: string | null;
    membershipId?: string | null;
    groupId?: string | null;
    actorType?: string | null;
    tags?: {
      id: string;
      slug: string;
      color?: string | null;
      name: string;
    }[];
    secretMetadata?: ResourceMetadataWithEncryptionDTO;
    isRotatedSecret?: boolean;
    isHoneyTokenSecret?: boolean;
    rotationId?: string;
    secretReminderRecipients?: TSecretReminderRecipient[];
  },
  secretValueHidden: boolean
) => ({
  secretKey: secret.key,
  secretPath,
  workspace: projectId,
  projectId,
  environment,
  secretComment: secret.comment || "",
  version: secret.version,
  type: secret.type,
  _id: secret.id,
  id: secret.id,
  user: secret.userId,
  actor: secret.actorType
    ? {
        actorType: secret.actorType,
        actorId: secret.userActorId || secret.identityActorId,
        name: secret.identityActorName || secret.userActorName,
        membershipId: secret.membershipId,
        groupId: secret.groupId
      }
    : undefined,
  tags: secret.tags,
  skipMultilineEncoding: secret.skipMultilineEncoding,
  secretReminderRepeatDays: secret.reminderRepeatDays,
  secretReminderNote: secret.reminderNote,
  metadata: secret.metadata,
  secretMetadata: secret.secretMetadata,
  createdAt: secret.createdAt,
  updatedAt: secret.updatedAt,
  isRotatedSecret: secret.isRotatedSecret,
  isHoneyTokenSecret: secret.isHoneyTokenSecret,
  rotationId: secret.rotationId,
  secretReminderRecipients: secret.secretReminderRecipients || [],
  ...(secretValueHidden
    ? {
        secretValue: secret.type === SecretType.Personal ? secret.value : INFISICAL_SECRET_VALUE_HIDDEN_MASK,
        secretValueHidden: true
      }
    : {
        secretValue: secret.value || "",
        secretValueHidden: false
      })
});

function escapeRegex(str: string): string {
  return str.replace(new RE2(/[.*+?^${}()|[\]\\]/g), "\\$&");
}

type TFnUpdateSecretLinkedReferences = {
  orgId: string;
  projectId: string;
  environment: string;
  secretPath: string;
  folderId: string;
  oldSecretKey: string;
  newSecretKey: string;
  secretId: string;
  secretDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "find"
    | "updateById"
    | "upsertSecretReferences"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceSecretKey"
  >;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
  encryptor: (data: { plainText: Buffer }) => { cipherTextBlob: Buffer };
  decryptor: (data: { cipherTextBlob: Buffer }) => Buffer;
  generateSecretBlindIndex: (secretValue: Buffer) => Promise<string>;
  tx?: Knex;
};

/**
 * Updates secret references when a secret key is renamed.
 * Handles both local references (same folder) and nested references (cross-folder/environment).
 */
export const fnUpdateSecretLinkedReferences = async ({
  orgId,
  projectId,
  environment,
  secretPath,
  folderId,
  oldSecretKey,
  newSecretKey,
  secretId,
  secretDAL,
  secretVersionDAL,
  folderCommitService,
  folderDAL,
  secretQueueService,
  encryptor,
  decryptor,
  generateSecretBlindIndex,
  tx
}: TFnUpdateSecretLinkedReferences) => {
  // case: nested references, can be inferred directly from the secret references table
  const nestedSecretReferences = await secretDAL.findReferencedSecretReferencesBySecretKey(
    projectId,
    environment,
    secretPath,
    oldSecretKey,
    tx
  );

  // case: local references, not stored in the db, we need to scan the folder to find secrets that reference the old secret ky
  const secretsInSameFolder = await secretDAL.find(
    {
      folderId,
      $notEqual: { [`${TableName.SecretV2}.id` as "id"]: secretId }
    },
    { tx }
  );

  const secretIdsToUpdateFromNested = nestedSecretReferences.map((el) => el.secretId);

  // for local refs, we need to check each secret in the folder
  const secretsToCheck = secretsInSameFolder.filter((s) => !secretIdsToUpdateFromNested.includes(s.id));

  const nestedSecretsToUpdate =
    secretIdsToUpdateFromNested.length > 0
      ? await secretDAL.find({ $in: { [`${TableName.SecretV2}.id` as "id"]: secretIdsToUpdateFromNested } }, { tx })
      : [];

  const allSecretsToUpdate: Array<TSecretsV2> = [...nestedSecretsToUpdate, ...secretsToCheck];

  // Use Map with secretId as key to avoid duplicates when a secret references the renamed secret multiple times
  const updatedSecretsMap: Map<
    string,
    { secret: TSecretsV2; newEncryptedValue: Buffer; newVersion: number; newBlindIndex: string }
  > = new Map();

  for await (const secretToUpdate of allSecretsToUpdate) {
    if (!secretToUpdate.encryptedValue) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const originalValue = decryptor({ cipherTextBlob: secretToUpdate.encryptedValue }).toString();
    let newValue = originalValue;

    // Pass the renamed key as a known local secret name so a reference like ${A.B} is treated as
    // a local reference to a dotted-name secret rather than a cross-environment reference.
    const { localReferences, nestedReferences } = getAllSecretReferences(originalValue, [oldSecretKey]);

    // checkk if this secret references the renamed secret at all (either locally or nested)
    const hasLocalRef = localReferences.includes(oldSecretKey);
    const hasNestedRef = nestedReferences.some(
      (ref) => ref.environment === environment && ref.secretPath === secretPath && ref.secretKey === oldSecretKey
    );

    if (!hasLocalRef && !hasNestedRef) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (hasLocalRef) {
      newValue = newValue.replace(new RE2(`\\$\\{${escapeRegex(oldSecretKey)}\\}`, "g"), `\${${newSecretKey}}`);
    }

    if (hasNestedRef) {
      const pathPart = secretPath === "/" ? "" : `.${secretPath.slice(1).replace(/\//g, ".")}`;

      const oldRef = `\${${environment}${pathPart}.${oldSecretKey}}`;
      const newRef = `\${${environment}${pathPart}.${newSecretKey}}`;

      newValue = newValue.split(oldRef).join(newRef);
    }

    if (newValue !== originalValue) {
      const newValueBuffer = Buffer.from(newValue);
      const newEncryptedValue = encryptor({ plainText: newValueBuffer }).cipherTextBlob;
      const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

      // Update secret with version increment
      const updatedSecret = await secretDAL.updateById(
        secretToUpdate.id,
        { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
        tx
      );

      // Track updated secret by ID to avoid duplicates
      updatedSecretsMap.set(secretToUpdate.id, {
        secret: updatedSecret,
        newEncryptedValue,
        newVersion: updatedSecret.version,
        newBlindIndex
      });
    }
  }

  // Group updated secrets by folder for commit creation
  const updatedSecretsByFolder: Map<
    string,
    Array<{ secret: TSecretsV2; newEncryptedValue: Buffer; newVersion: number; newBlindIndex: string }>
  > = new Map();
  for (const [, data] of updatedSecretsMap) {
    const folderSecrets = updatedSecretsByFolder.get(data.secret.folderId) || [];
    folderSecrets.push(data);
    updatedSecretsByFolder.set(data.secret.folderId, folderSecrets);
  }

  for await (const [updateFolderId, folderSecrets] of updatedSecretsByFolder) {
    const secretVersions = await secretVersionDAL.insertMany(
      folderSecrets.map(({ secret, newEncryptedValue, newVersion, newBlindIndex }) => ({
        secretId: secret.id,
        version: newVersion,
        key: secret.key,
        encryptedValue: newEncryptedValue,
        encryptedComment: secret.encryptedComment,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        type: secret.type,
        metadata: secret.metadata,
        folderId: secret.folderId,
        userId: secret.userId,
        actorType: ActorType.PLATFORM,
        secretValueBlindIndex: newBlindIndex
      })),
      tx
    );

    const changes = secretVersions.map((sv) => ({
      type: CommitType.ADD,
      isUpdate: true,
      secretVersionId: sv.id
    }));

    if (changes.length > 0) {
      await folderCommitService.createCommit(
        {
          actor: {
            type: ActorType.PLATFORM
          },
          message: "Secret references updated after referenced secret(s) was renamed",
          folderId: updateFolderId,
          changes
        },
        tx
      );
    }
  }

  // update the secret references table (only for nested refs)
  await secretDAL.updateSecretReferenceSecretKey(projectId, environment, secretPath, oldSecretKey, newSecretKey, tx);

  const updatedFolderIds = Array.from(updatedSecretsByFolder.keys());
  if (updatedFolderIds.length > 0) {
    const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, updatedFolderIds, tx);

    await Promise.all(
      folderPaths.map(async (folder) => {
        if (folder) {
          await secretQueueService.syncSecrets({
            projectId,
            orgId,
            environmentSlug: folder.environmentSlug,
            environmentName: folder.environmentName,
            secretPath: folder.path,
            actor: ActorType.PLATFORM,
            actorId: ""
          });
        }
      })
    );
  }
};

type TFnUpdateMovedSecretReferences = {
  orgId: string;
  projectId: string;
  sourceEnvironment: string;
  sourceSecretPath: string;
  sourceFolderId: string;
  destinationEnvironment: string;
  destinationSecretPath: string;
  destinationFolderId: string;
  secretKey: string;
  secretId: string;
  secretDAL: Pick<
    TSecretV2BridgeDALFactory,
    | "find"
    | "findOne"
    | "updateById"
    | "upsertSecretReferences"
    | "findReferencedSecretReferencesBySecretKey"
    | "updateSecretReferenceEnvAndPath"
  >;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
  encryptor: (data: { plainText: Buffer }) => { cipherTextBlob: Buffer };
  decryptor: (data: { cipherTextBlob: Buffer }) => Buffer;
  generateSecretBlindIndex: (secretValue: Buffer) => Promise<string>;
  tx?: Knex;
};

/**
 * Updates secret references when a secret is moved from one location to another.
 * Handles three cases:
 * 1. Local to nested: Secret moved out of folder, convert ${secretKey} to ${env.path.secretKey}
 * 2. Nested to nested: Secret moved between folders, update ${oldEnv.oldPath.secretKey} to ${newEnv.newPath.secretKey}
 * 3. Nested to local: Secret moved back to same folder, convert ${env.path.secretKey} to ${secretKey}
 */
export const fnUpdateMovedSecretReferences = async ({
  orgId,
  projectId,
  sourceEnvironment,
  sourceSecretPath,
  sourceFolderId,
  destinationEnvironment,
  destinationSecretPath,
  destinationFolderId,
  secretKey,
  secretId,
  secretDAL,
  secretVersionDAL,
  folderCommitService,
  folderDAL,
  secretQueueService,
  encryptor,
  decryptor,
  generateSecretBlindIndex,
  tx
}: TFnUpdateMovedSecretReferences) => {
  // Use Map with secretId as key to avoid duplicates when a secret references multiple moved secrets
  const updatedSecretsMap: Map<
    string,
    { secret: TSecretsV2; newEncryptedValue: Buffer; newVersion: number; newBlindIndex: string }
  > = new Map();

  const destPathPart = destinationSecretPath === "/" ? "" : `.${destinationSecretPath.slice(1).replaceAll("/", ".")}`;
  const newNestedRef = `\${${destinationEnvironment}${destPathPart}.${secretKey}}`;

  // case: local references, not stored in the db, we need to scan the folder to find secrets that reference the old secret ky
  const secretsInSourceFolder = await secretDAL.find(
    {
      folderId: sourceFolderId,
      $notEqual: { [`${TableName.SecretV2}.id` as "id"]: secretId }
    },
    { tx }
  );

  const destinationMovedSecret = await secretDAL.findOne({ id: secretId }, tx);

  for await (const secretToUpdate of secretsInSourceFolder) {
    if (!secretToUpdate.encryptedValue) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const originalValue = decryptor({ cipherTextBlob: secretToUpdate.encryptedValue }).toString();
    const { localReferences, nestedReferences } = getAllSecretReferences(originalValue);

    const hasLocalRef = localReferences.includes(secretKey);
    if (!hasLocalRef) {
      // eslint-disable-next-line no-continue
      continue;
    }

    // convert local reference ${secretKey} to nested reference ${destEnv.destPath.secretKey}
    const newValue = originalValue.replace(new RE2(`\\$\\{${escapeRegex(secretKey)}\\}`, "g"), newNestedRef);

    if (newValue !== originalValue) {
      const newValueBuffer = Buffer.from(newValue);
      const newEncryptedValue = encryptor({ plainText: newValueBuffer }).cipherTextBlob;
      const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

      // Update secret with version increment - use $incr to properly increment version
      const updatedSecret = await secretDAL.updateById(
        secretToUpdate.id,
        { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
        tx
      );

      // Track updated secret by ID to avoid duplicates
      updatedSecretsMap.set(secretToUpdate.id, {
        secret: updatedSecret,
        newEncryptedValue,
        newVersion: updatedSecret.version,
        newBlindIndex
      });

      // update the secret references table (only for nested refs)
      const updatedNestedRefs = [
        ...nestedReferences,
        { environment: destinationEnvironment, secretPath: destinationSecretPath, secretKey }
      ];

      await secretDAL.upsertSecretReferences([{ secretId: secretToUpdate.id, references: updatedNestedRefs }], tx);
    }
  }

  // case: nested references, can be inferred directly from the secret references table
  const nestedSecretReferences = await secretDAL.findReferencedSecretReferencesBySecretKey(
    projectId,
    sourceEnvironment,
    sourceSecretPath,
    secretKey,
    tx
  );

  if (nestedSecretReferences.length > 0) {
    const sourcePathPart = sourceSecretPath === "/" ? "" : `.${sourceSecretPath.slice(1).replace(/\//g, ".")}`;
    const oldNestedRef = `\${${sourceEnvironment}${sourcePathPart}.${secretKey}}`;

    // local reference format (for when moved to same folder)
    const localRef = `\${${secretKey}}`;

    const refsInDestFolder = nestedSecretReferences.filter((ref) => ref.folderId === destinationFolderId);
    const refsInOtherFolders = nestedSecretReferences.filter((ref) => ref.folderId !== destinationFolderId);

    if (refsInDestFolder.length > 0) {
      const secretIdsInDestFolder = refsInDestFolder.map((el) => el.secretId);
      const secretsInDestFolder = await secretDAL.find(
        { $in: { [`${TableName.SecretV2}.id` as "id"]: secretIdsInDestFolder } },
        { tx }
      );

      for await (const secretToUpdate of secretsInDestFolder) {
        if (!secretToUpdate.encryptedValue) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const originalValue = decryptor({ cipherTextBlob: secretToUpdate.encryptedValue }).toString();
        const { nestedReferences } = getAllSecretReferences(originalValue);

        // convert nested ref to local ref
        const newValue = originalValue.split(oldNestedRef).join(localRef);

        if (newValue !== originalValue) {
          const newValueBuffer = Buffer.from(newValue);
          const newEncryptedValue = encryptor({ plainText: newValueBuffer }).cipherTextBlob;
          const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

          // Update secret with version increment
          const updatedSecret = await secretDAL.updateById(
            secretToUpdate.id,
            { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
            tx
          );

          // Track updated secret by ID to avoid duplicates
          updatedSecretsMap.set(secretToUpdate.id, {
            secret: updatedSecret,
            newEncryptedValue,
            newVersion: updatedSecret.version,
            newBlindIndex
          });

          const updatedNestedRefs = nestedReferences.filter(
            (ref) =>
              !(
                ref.environment === sourceEnvironment &&
                ref.secretPath === sourceSecretPath &&
                ref.secretKey === secretKey
              )
          );

          await secretDAL.upsertSecretReferences([{ secretId: secretToUpdate.id, references: updatedNestedRefs }], tx);
        }
      }
    }

    // update nested ref to point to new location
    if (refsInOtherFolders.length > 0) {
      const secretIdsInOtherFolders = refsInOtherFolders.map((el) => el.secretId);
      const secretsInOtherFolders = await secretDAL.find(
        { $in: { [`${TableName.SecretV2}.id` as "id"]: secretIdsInOtherFolders } },
        { tx }
      );

      for await (const secretToUpdate of secretsInOtherFolders) {
        if (!secretToUpdate.encryptedValue) {
          // eslint-disable-next-line no-continue
          continue;
        }

        const originalValue = decryptor({ cipherTextBlob: secretToUpdate.encryptedValue }).toString();
        const { nestedReferences } = getAllSecretReferences(originalValue);

        // replace old nested ref with new nested ref
        const newValue = originalValue.split(oldNestedRef).join(newNestedRef);

        if (newValue !== originalValue) {
          const newValueBuffer = Buffer.from(newValue);
          const newEncryptedValue = encryptor({ plainText: newValueBuffer }).cipherTextBlob;
          const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

          // Update secret with version increment
          const updatedSecret = await secretDAL.updateById(
            secretToUpdate.id,
            { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
            tx
          );

          // Track updated secret by ID to avoid duplicates
          updatedSecretsMap.set(secretToUpdate.id, {
            secret: updatedSecret,
            newEncryptedValue,
            newVersion: updatedSecret.version,
            newBlindIndex
          });

          const updatedNestedRefs = nestedReferences.map((ref) => {
            if (
              ref.environment === sourceEnvironment &&
              ref.secretPath === sourceSecretPath &&
              ref.secretKey === secretKey
            ) {
              return { environment: destinationEnvironment, secretPath: destinationSecretPath, secretKey };
            }
            return ref;
          });

          await secretDAL.upsertSecretReferences([{ secretId: secretToUpdate.id, references: updatedNestedRefs }], tx);
        }
      }
    }
  }

  // update the moved secret's own references:
  // case 1: local references should become nested references (pointing back to source folder, but only if the referenced secret wasan'tt also moved)
  // case 2: nested references should become local references (if they point to the destination folder)
  if (destinationMovedSecret?.encryptedValue) {
    const movedSecretValue = decryptor({ cipherTextBlob: destinationMovedSecret.encryptedValue }).toString();
    const { localReferences, nestedReferences } = getAllSecretReferences(movedSecretValue);

    let updatedValue = movedSecretValue;
    let valueChanged = false;

    // case 1: convert local references to nested references pointing back to source
    if (localReferences.length > 0) {
      const destinationSecrets = await secretDAL.find({ folderId: destinationFolderId }, { tx });
      const destinationSecretKeys = new Set(destinationSecrets.map((s) => s.key));

      // Build the nested reference prefix for source
      const sourcePathPart = sourceSecretPath === "/" ? "" : `.${sourceSecretPath.slice(1).replace(/\//g, ".")}`;
      const sourceNestedPrefix = `${sourceEnvironment}${sourcePathPart}.`;

      for (const localRef of localReferences) {
        // only convert to nested if the referenced secret doesn't exist in the destination
        if (!destinationSecretKeys.has(localRef)) {
          const localPattern = new RE2(`\\$\\{${escapeRegex(localRef)}\\}`, "g");
          const nestedRef = `\${${sourceNestedPrefix}${localRef}}`;
          updatedValue = updatedValue.replace(localPattern, nestedRef);
          valueChanged = true;
        }
      }
    }

    // case 2: convert nested references to local if they point to the destination folder
    for (const nestedRef of nestedReferences) {
      if (nestedRef.environment === destinationEnvironment && nestedRef.secretPath === destinationSecretPath) {
        // this nested reference points to the destination folder, convert to local
        const nestedPathPart =
          nestedRef.secretPath === "/" ? "" : `.${nestedRef.secretPath.slice(1).replace(/\//g, ".")}`;
        const oldNestedRefStr = `\${${nestedRef.environment}${nestedPathPart}.${nestedRef.secretKey}}`;
        const localRefStr = `\${${nestedRef.secretKey}}`;

        updatedValue = updatedValue.split(oldNestedRefStr).join(localRefStr);
        valueChanged = true;
      }
    }

    if (valueChanged) {
      const newValueBuffer = Buffer.from(updatedValue);
      const newEncryptedValue = encryptor({ plainText: newValueBuffer }).cipherTextBlob;
      const newBlindIndex = await generateSecretBlindIndex(newValueBuffer);

      // Update secret with version increment
      const updatedSecret = await secretDAL.updateById(
        destinationMovedSecret.id,
        { encryptedValue: newEncryptedValue, secretValueBlindIndex: newBlindIndex, $incr: { version: 1 } },
        tx
      );

      // Track updated secret by ID to avoid duplicates
      updatedSecretsMap.set(destinationMovedSecret.id, {
        secret: updatedSecret,
        newEncryptedValue,
        newVersion: updatedSecret.version,
        newBlindIndex
      });

      const { nestedReferences: finalNestedReferences } = getAllSecretReferences(updatedValue);
      await secretDAL.upsertSecretReferences(
        [{ secretId: destinationMovedSecret.id, references: finalNestedReferences }],
        tx
      );
    }
  }

  // Group updated secrets by folder for commit creation
  const updatedSecretsByFolder: Map<
    string,
    Array<{ secret: TSecretsV2; newEncryptedValue: Buffer; newVersion: number; newBlindIndex: string }>
  > = new Map();
  for (const [, data] of updatedSecretsMap) {
    const folderSecrets = updatedSecretsByFolder.get(data.secret.folderId) || [];
    folderSecrets.push(data);
    updatedSecretsByFolder.set(data.secret.folderId, folderSecrets);
  }

  for await (const [updateFolderId, folderSecrets] of updatedSecretsByFolder) {
    const secretVersions = await secretVersionDAL.insertMany(
      folderSecrets.map(({ secret, newEncryptedValue, newVersion, newBlindIndex }) => ({
        secretId: secret.id,
        version: newVersion,
        key: secret.key,
        encryptedValue: newEncryptedValue,
        encryptedComment: secret.encryptedComment,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        type: secret.type,
        metadata: secret.metadata,
        folderId: secret.folderId,
        userId: secret.userId,
        actorType: ActorType.PLATFORM,
        secretValueBlindIndex: newBlindIndex
      })),
      tx
    );

    const changes = secretVersions.map((sv) => ({
      type: CommitType.ADD,
      isUpdate: true,
      secretVersionId: sv.id
    }));

    if (changes.length > 0) {
      await folderCommitService.createCommit(
        {
          actor: {
            type: ActorType.PLATFORM
          },
          message: "Secret references updated after referenced secret(s) was moved to a new location",
          folderId: updateFolderId,
          changes
        },
        tx
      );
    }
  }

  const updatedFolderIds = Array.from(updatedSecretsByFolder.keys());
  if (updatedFolderIds.length > 0) {
    const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, updatedFolderIds, tx);

    await Promise.all(
      folderPaths.map(async (folder) => {
        if (folder) {
          await secretQueueService.syncSecrets({
            projectId,
            orgId,
            environmentSlug: folder.environmentSlug,
            environmentName: folder.environmentName,
            secretPath: folder.path,
            actor: ActorType.PLATFORM,
            actorId: ""
          });
        }
      })
    );
  }
};

type TCreateFetchFolderSecretsWithImportsArg = {
  projectId: string;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds" | "findByIds">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
};

// Returns a function that fetches direct secrets for a folder merged with its
// one-level-deep imported secrets. Direct secrets take priority over imports.
export const createFetchFolderSecretsWithImports = ({
  projectId,
  secretDAL,
  secretImportDAL,
  folderDAL
}: TCreateFetchFolderSecretsWithImportsArg) => {
  type ImportRow = Omit<TSecretImports, "importEnv"> & { importEnv: { id: string; slug: string; name: string } };
  type SecretRow = Awaited<ReturnType<TCreateFetchFolderSecretsWithImportsArg["secretDAL"]["findByFolderId"]>>[number];

  const recursiveFetch = async (
    folderId: string,
    userIdArg: string | undefined,
    visitedFolderIds: Set<string>
  ): Promise<SecretRow[]> => {
    if (visitedFolderIds.has(folderId)) return [];
    visitedFolderIds.add(folderId);

    const directSecrets = await secretDAL.findByFolderId({ folderId, userId: userIdArg });
    const rawImports = (await secretImportDAL.findByFolderIds([folderId])) as ImportRow[];
    if (!rawImports.length) return directSecrets;

    const reservedIds: string[] = [];
    for (const imp of rawImports) {
      if (imp.isReserved) {
        const match = RESERVED_REPLICATION_IMPORT_REGEX.exec(imp.importPath);
        if (match) reservedIds.push(match[1]);
      }
    }
    let activeImports: ImportRow[] = rawImports;
    if (reservedIds.length) {
      const referenced = (await secretImportDAL.findByIds(reservedIds)) as ImportRow[];
      const detailMap = new Map(referenced.map((r) => [r.id, { importPath: r.importPath, importEnv: r.importEnv }]));
      activeImports = rawImports.map((imp) => {
        if (!imp.isReserved) return imp;
        const match = RESERVED_REPLICATION_IMPORT_REGEX.exec(imp.importPath);
        if (!match) return imp;
        const details = detailMap.get(match[1]);
        return details ? { ...imp, importPath: details.importPath, importEnv: details.importEnv } : imp;
      });
    }

    const importedFolders = await Promise.all(
      activeImports.map((i) => folderDAL.findBySecretPath(projectId, i.importEnv.slug, i.importPath))
    );
    const importedSecretArrays = await Promise.all(
      importedFolders.filter(Boolean).map((f) => recursiveFetch(f!.id, userIdArg, visitedFolderIds))
    );
    const importedMerged = new Map<string, SecretRow>(importedSecretArrays.flat().map((s) => [s.key, s]));
    directSecrets.forEach((s) => importedMerged.set(s.key, s));
    return [...importedMerged.values()];
  };

  return (args: { folderId: string; userId?: string }) => recursiveFetch(args.folderId, args.userId, new Set());
};

type TCreateRelativeImportExpanderArg = {
  projectId: string;
  currentEnvironment: string;
  currentSecretPath: string;
  secretDAL: Pick<TSecretV2BridgeDALFactory, "findByFolderId">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findByFolderIds" | "findByIds">;
  folderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  decryptSecretValue: (value?: Buffer | null) => string;
  canExpandValue: (environment: string, secretPath: string, secretKey: string, secretTagSlugs: string[]) => boolean;
  userId?: string;
};

export const createRelativeImportExpander = ({
  projectId,
  currentEnvironment,
  currentSecretPath,
  secretDAL,
  secretImportDAL,
  folderDAL,
  decryptSecretValue,
  canExpandValue,
  userId
}: TCreateRelativeImportExpanderArg): {
  expandImportedSecretReferences: (inputSecret: {
    value?: string;
    skipMultilineEncoding?: boolean | null;
    secretPath: string;
    environment: string;
    secretKey: string;
  }) => Promise<string | undefined>;
} => {
  const relativeImportExpanders = new Map<string, ReturnType<typeof expandSecretReferencesFactory>>();
  const fetchFolderSecretsWithImports = createFetchFolderSecretsWithImports({
    projectId,
    secretDAL,
    secretImportDAL,
    folderDAL
  });

  const getRelativeExpander = (sourceEnvironment: string, sourcePath: string) => {
    const expanderKey = `${sourceEnvironment}:${sourcePath}`;
    if (relativeImportExpanders.has(expanderKey)) return relativeImportExpanders.get(expanderKey)!;

    const virtualFolderId = `__relative_import_${expanderKey}`;
    const keyOriginMap = new Map<string, { environment: string; secretPath: string }>();

    const expander = expandSecretReferencesFactory({
      projectId,
      folderDAL: {
        findBySecretPath: async (pId, env, sPath) => {
          if (env === currentEnvironment && sPath === currentSecretPath) {
            // Intercept current-env lookups and return the virtual merged-folder sentinel
            return { id: virtualFolderId } as unknown as Awaited<ReturnType<typeof folderDAL.findBySecretPath>>;
          }
          return folderDAL.findBySecretPath(pId, env, sPath);
        }
      },
      secretDAL: {
        findByFolderId: async (folderIdArgs) => {
          if (folderIdArgs.folderId !== virtualFolderId) {
            // non-virtual folder (e.g. prod, staging, etc). use import-aware fetch so that local refs within absolute-ref chains can resolve through the env's own secret imports.
            return fetchFolderSecretsWithImports({ folderId: folderIdArgs.folderId, userId: folderIdArgs.userId });
          }
          const [currentFolder, sourceFolder] = await Promise.all([
            folderDAL.findBySecretPath(projectId, currentEnvironment, currentSecretPath),
            folderDAL.findBySecretPath(projectId, sourceEnvironment, sourcePath)
          ]);
          const [currentSecrets, sourceSecrets] = await Promise.all([
            currentFolder
              ? fetchFolderSecretsWithImports({ folderId: currentFolder.id, userId: folderIdArgs.userId })
              : [],
            sourceFolder
              ? fetchFolderSecretsWithImports({ folderId: sourceFolder.id, userId: folderIdArgs.userId })
              : []
          ]);
          // source goes in first (lower priority). current overwrites (higher priority). record the origin of each key so the permission check can use the right env.
          const envMerged = new Map(
            sourceSecrets.map((s) => {
              keyOriginMap.set(s.key, { environment: sourceEnvironment, secretPath: sourcePath });
              return [s.key, s];
            })
          );
          currentSecrets.forEach((s) => {
            keyOriginMap.set(s.key, { environment: currentEnvironment, secretPath: currentSecretPath });
            envMerged.set(s.key, s);
          });
          return [...envMerged.values()];
        }
      },
      decryptSecretValue,
      // for local references resolved through the virtual merged folder, check permission against the secret's actual origin env — not the current env.
      // without this, a user with broad current-env access could bypass source-env access controls on keys that fall through from the source when the current env has no override.
      canExpandValue: (environment, secretPath, secretKey, secretTagSlugs) => {
        if (environment === currentEnvironment && secretPath === currentSecretPath) {
          const origin = keyOriginMap.get(secretKey);
          if (origin) return canExpandValue(origin.environment, origin.secretPath, secretKey, secretTagSlugs);
          return false;
        }
        return canExpandValue(environment, secretPath, secretKey, secretTagSlugs);
      },
      userId
    });

    relativeImportExpanders.set(expanderKey, expander);
    return expander;
  };

  const expandImportedSecretReferences = (inputSecret: {
    value?: string;
    skipMultilineEncoding?: boolean | null;
    secretPath: string;
    environment: string;
    secretKey: string;
  }) => {
    const { expandSecretReferences: relativeExpand } = getRelativeExpander(
      inputSecret.environment,
      inputSecret.secretPath
    );
    return relativeExpand({ ...inputSecret, environment: currentEnvironment, secretPath: currentSecretPath });
  };

  return { expandImportedSecretReferences };
};

// moves a batch of secrets from one folder to another inside the caller-supplied transaction.
// performs the two-step move (create/update at destination, then delete at source) plus reference
// updates, but does NOT snapshot/sync/invalidate the cache — the caller runs those after the tx
// commits.
export const fnSecretMove = async (dto: TFnSecretMove): Promise<TFnSecretMoveResult> => {
  const {
    projectId,
    sourceEnvironment,
    sourceSecretPath,
    destinationEnvironment,
    destinationSecretPath,
    secretIds,
    shouldOverwrite,
    actor,
    actorId,
    actorOrgId,
    permission,
    tx,
    kmsService,
    folderDAL,
    secretDAL,
    secretVersionDAL,
    secretTagDAL,
    secretVersionTagDAL,
    resourceMetadataDAL,
    folderCommitService,
    secretApprovalPolicyService,
    secretApprovalRequestDAL,
    secretApprovalRequestSecretDAL,
    secretQueueService,
    reminderDAL,
    reminderService
  } = dto;

  const sourceFolder = await folderDAL.findBySecretPath(projectId, sourceEnvironment, sourceSecretPath, tx);
  if (!sourceFolder) {
    throw new NotFoundError({
      message: `Source folder with path '${sourceSecretPath}' in environment with slug '${sourceEnvironment}' not found`
    });
  }

  const destinationFolder = await folderDAL.findBySecretPath(
    projectId,
    destinationEnvironment,
    destinationSecretPath,
    tx
  );

  if (!destinationFolder) {
    throw new NotFoundError({
      message: `Destination folder with path '${destinationSecretPath}' in environment with slug '${destinationEnvironment}' not found`
    });
  }

  const sourceSecrets = await secretDAL.find(
    {
      type: SecretType.Shared,
      folderId: sourceFolder.id,
      $in: {
        [`${TableName.SecretV2}.id` as "id"]: secretIds
      }
    },
    { tx }
  );

  if (sourceSecrets.length !== secretIds.length) {
    throw new NotFoundError({
      message: `One or more secrets not found in source folder with path '${sourceSecretPath}' and environment slug '${sourceEnvironment}'`
    });
  }
  const sourceActions = [
    ProjectPermissionSecretActions.Delete,
    ProjectPermissionSecretActions.ReadValue,
    ProjectPermissionSecretActions.DescribeSecret
  ] as const;
  const destinationActions = [ProjectPermissionSecretActions.Create, ProjectPermissionSecretActions.Edit] as const;

  sourceSecrets.forEach((secret) => {
    if (secret.isRotatedSecret) {
      throw new BadRequestError({ message: `Cannot move rotated secret: ${secret.key}` });
    }
    if (secret.isHoneyTokenSecret) {
      throw new BadRequestError({ message: `Cannot move honey token secret: ${secret.key}` });
    }

    for (const sourceAction of sourceActions) {
      if (
        sourceAction === ProjectPermissionSecretActions.DescribeSecret ||
        sourceAction === ProjectPermissionSecretActions.ReadValue
      ) {
        throwIfMissingSecretReadValueOrDescribePermission(permission, sourceAction, {
          environment: sourceEnvironment,
          secretPath: sourceSecretPath,
          secretName: secret.key,
          secretTags: secret.tags.map((el) => el.slug)
        });
      } else {
        ForbiddenError.from(permission).throwUnlessCan(
          sourceAction,
          subject(ProjectPermissionSub.Secrets, {
            environment: sourceEnvironment,
            secretPath: sourceSecretPath,
            secretName: secret.key,
            secretTags: secret.tags.map((el) => el.slug)
          })
        );
      }
    }
  });

  const {
    encryptor: secretManagerEncryptor,
    decryptor: secretManagerDecryptor,
    generateSecretBlindIndex
  } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });
  const decryptedSourceSecrets = sourceSecrets.map((secret) => ({
    ...secret,
    value: secret.encryptedValue
      ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
      : undefined
  }));

  const sourceReminders = await reminderDAL.findSecretReminders(secretIds, tx);
  const sourceSecretIdToKey = Object.fromEntries(decryptedSourceSecrets.map((s) => [s.id, s.key]));

  let isSourceUpdated = false;
  let isDestinationUpdated = false;

  // Moving secrets is a two-step process.
  // First step is to create/update the secret in the destination:
  const destinationSecretsFromDB = await secretDAL.find(
    {
      folderId: destinationFolder.id
    },
    { tx }
  );

  const decryptedDestinationSecrets = destinationSecretsFromDB.map((secret) => {
    return {
      ...secret,
      value: secret.encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: secret.encryptedValue }).toString()
        : undefined
    };
  });

  const destinationSecretsGroupedByKey = groupBy(decryptedDestinationSecrets, (i) => i.key);

  const sourceKeys = decryptedSourceSecrets.map((s) => s.key);

  const conflictingRotationSecretKeys = sourceKeys.filter(
    (key) => destinationSecretsGroupedByKey[key]?.[0]?.isRotatedSecret
  );
  if (conflictingRotationSecretKeys.length > 0) {
    throw new BadRequestError({
      message: `Cannot move secrets to '${destinationFolder.path}' because the following keys are managed by a secret rotation at the destination: ${conflictingRotationSecretKeys.join(", ")}`
    });
  }

  const conflictingHoneyTokenSecretKeys = sourceKeys.filter(
    (key) => destinationSecretsGroupedByKey[key]?.[0]?.isHoneyTokenSecret
  );
  if (conflictingHoneyTokenSecretKeys.length > 0) {
    throw new BadRequestError({
      message: `Cannot move secrets to '${destinationFolder.path}' because the following keys are managed by a honey token at the destination: ${conflictingHoneyTokenSecretKeys.join(", ")}`
    });
  }

  const locallyCreatedSecrets = decryptedSourceSecrets
    .filter(({ key }) => !destinationSecretsGroupedByKey[key]?.[0])
    .map((el) => ({ ...el, operation: SecretOperations.Create }));

  const locallyUpdatedSecrets = decryptedSourceSecrets
    .filter(
      ({ key, value }) =>
        destinationSecretsGroupedByKey[key]?.[0] && destinationSecretsGroupedByKey[key]?.[0]?.value !== value
    )
    .map((el) => ({ ...el, operation: SecretOperations.Update }));

  if (locallyUpdatedSecrets.length > 0 && !shouldOverwrite) {
    const existingKeys = locallyUpdatedSecrets.map((s) => s.key);

    throw new BadRequestError({
      message: `Failed to move secrets. The following secrets already exist in the destination: ${existingKeys.join(
        ","
      )}`
    });
  }

  const isEmpty = locallyCreatedSecrets.length + locallyUpdatedSecrets.length === 0;

  if (isEmpty) {
    throw new BadRequestError({
      message: "Selected secrets already exist in the destination."
    });
  }

  const secretsToApplyAtDestination = locallyCreatedSecrets.concat(locallyUpdatedSecrets);

  for (const secret of secretsToApplyAtDestination) {
    for (const destinationAction of destinationActions) {
      ForbiddenError.from(permission).throwUnlessCan(
        destinationAction,
        subject(ProjectPermissionSub.Secrets, {
          environment: destinationEnvironment,
          secretPath: destinationFolder.path,
          secretName: secret.key,
          secretTags: secret.tags.map((el) => el.slug)
        })
      );
    }
  }

  const destinationFolderPolicy = await secretApprovalPolicyService.getSecretApprovalPolicy(
    projectId,
    destinationFolder.environment.slug,
    destinationFolder.path
  );

  let destinationSecretIdByKey: Record<string, string | undefined> = {};

  if (destinationFolderPolicy && actor === ActorType.USER) {
    // if secret approval policy exists for destination, we create the secret approval request
    const localSecretsIds = decryptedDestinationSecrets.map(({ id }) => id);
    const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(
      destinationFolder.id,
      localSecretsIds,
      tx
    );

    const approvalRequestDoc = await secretApprovalRequestDAL.create(
      {
        folderId: destinationFolder.id,
        slug: alphaNumericNanoId(),
        policyId: destinationFolderPolicy.id,
        status: "open",
        hasMerged: false,
        committerUserId: actorId
      },
      tx
    );

    const commits = secretsToApplyAtDestination.map((doc) => {
      const { operation } = doc;
      const localSecret = destinationSecretsGroupedByKey[doc.key]?.[0];

      return {
        ...(operation === SecretOperations.Create
          ? {
              internalMetadata: {
                type: InternalMetadataType.MoveSecret,
                payload: {
                  source: {
                    secretPath: sourceSecretPath,
                    environment: sourceEnvironment
                  }
                }
              } as TInternalMetadata
            }
          : {}),
        op: operation,
        requestId: approvalRequestDoc.id,
        metadata: doc.metadata,
        key: doc.key,
        encryptedValue: doc.encryptedValue,
        encryptedComment: doc.encryptedComment,
        skipMultilineEncoding: doc.skipMultilineEncoding,
        // except create operation other two needs the secret id and version id
        ...(operation !== SecretOperations.Create
          ? { secretId: localSecret.id, secretVersion: latestSecretVersions[localSecret.id].id }
          : {})
      };
    });
    const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(commits, tx);

    const approvalCommitsGroupedByKey = groupBy(approvalCommits, (i) => i.key);
    const approvalSecretTags = secretsToApplyAtDestination.flatMap((doc) =>
      doc.tags.map((tag) => ({
        secretId: approvalCommitsGroupedByKey[doc.key][0].id,
        tagId: tag.id
      }))
    );
    if (approvalSecretTags.length) {
      await secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags(approvalSecretTags, tx);
    }
  } else {
    // apply changes directly
    let createdSecrets: { id: string; key: string }[] = [];

    if (locallyCreatedSecrets.length) {
      const inputSecretsForCreate = await Promise.all(
        locallyCreatedSecrets.map(async (doc) => ({
          type: doc.type,
          metadata: doc.metadata,
          key: doc.key,
          encryptedValue: doc.encryptedValue,
          encryptedComment: doc.encryptedComment,
          skipMultilineEncoding: doc.skipMultilineEncoding,
          reminderNote: doc.reminderNote,
          reminderRepeatDays: doc.reminderRepeatDays,
          secretMetadata: doc.secretMetadata?.map(({ key, value, encryptedValue }) => ({
            key,
            value: value || undefined,
            encryptedValue: encryptedValue || undefined
          })) as { key: string; value?: string; encryptedValue?: Buffer }[] | undefined,
          references: doc.value ? getAllSecretReferences(doc.value).nestedReferences : [],
          tagIds: doc.tags.map((tag) => tag.id),
          secretValueBlindIndex: doc.value ? await generateSecretBlindIndex(Buffer.from(doc.value)) : undefined
        }))
      );

      createdSecrets = await fnSecretBulkInsert({
        folderId: destinationFolder.id,
        orgId: actorOrgId,
        secretVersionDAL,
        secretDAL,
        tx,
        secretTagDAL,
        resourceMetadataDAL,
        folderCommitService,
        secretVersionTagDAL,
        actor: {
          type: actor,
          actorId
        },
        inputSecrets: inputSecretsForCreate
      });
    }
    if (locallyUpdatedSecrets.length) {
      const inputSecretsForUpdate = await Promise.all(
        locallyUpdatedSecrets.map(async (doc) => ({
          filter: {
            folderId: destinationFolder.id,
            id: destinationSecretsGroupedByKey[doc.key][0].id
          },
          data: {
            metadata: doc.metadata,
            key: doc.key,
            encryptedComment: doc.encryptedComment,
            skipMultilineEncoding: doc.skipMultilineEncoding,
            secretMetadata: doc.secretMetadata?.map(({ key, value, encryptedValue }) => ({
              key,
              value,
              encryptedValue
            })) as { key: string; value?: string; encryptedValue?: Buffer }[] | undefined,
            tags: doc.tags.map((tag) => tag.id),
            ...(doc.encryptedValue
              ? {
                  encryptedValue: doc.encryptedValue,
                  references: doc.value ? getAllSecretReferences(doc.value).nestedReferences : [],
                  secretValueBlindIndex: doc.value ? await generateSecretBlindIndex(Buffer.from(doc.value)) : undefined
                }
              : {
                  encryptedValue: undefined,
                  references: undefined
                })
          }
        }))
      );

      await fnSecretBulkUpdate({
        folderId: destinationFolder.id,
        orgId: actorOrgId,
        resourceMetadataDAL,
        folderCommitService,
        secretVersionDAL,
        secretDAL,
        tx,
        secretTagDAL,
        secretVersionTagDAL,
        actor: {
          type: actor,
          actorId
        },
        inputSecrets: inputSecretsForUpdate
      });
    }

    const createdSecretsGroupedByKey = groupBy(createdSecrets, (s) => s.key);
    destinationSecretIdByKey = Object.fromEntries(
      decryptedSourceSecrets.map((s) => {
        // for created secrets, use the newly created ID
        if (createdSecretsGroupedByKey[s.key]?.[0]) {
          return [s.key, createdSecretsGroupedByKey[s.key][0].id];
        }
        return [s.key, destinationSecretsGroupedByKey[s.key]?.[0]?.id];
      })
    );

    // carry the source secrets' reminders over to the destination secrets so the schedule
    // (message, repeatDays, nextReminderDate, fromDate, recipients) survives the move.
    const remindersToCreate = sourceReminders
      .map((rem) => {
        const key = rem.secretId ? sourceSecretIdToKey[rem.secretId] : undefined;
        const destinationSecretId = key ? destinationSecretIdByKey[key] : undefined;
        if (!destinationSecretId) return null;
        return {
          secretId: destinationSecretId,
          message: rem.message,
          repeatDays: rem.repeatDays,
          nextReminderDate: rem.nextReminderDate,
          fromDate: rem.fromDate,
          recipients: rem.recipients,
          projectId
        };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (remindersToCreate.length) {
      // we can delete the reminders in this case, because if it gets in this step,
      //  it means that the move is a overwrite move or there is no existing reminder for the secret.
      await reminderDAL.delete({ $in: { secretId: remindersToCreate.map((r) => r.secretId) } }, tx);
      await reminderService.batchCreateReminders(remindersToCreate, tx);
    }

    isDestinationUpdated = true;
  }

  // Next step is to delete the secrets from the source folder:
  const sourceSecretsGroupByKey = groupBy(sourceSecrets, (i) => i.key);
  const locallyDeletedSecrets = decryptedSourceSecrets.map((el) => ({ ...el, operation: SecretOperations.Delete }));

  const sourceFolderPolicy = await secretApprovalPolicyService.getSecretApprovalPolicy(
    projectId,
    sourceFolder.environment.slug,
    sourceFolder.path
  );

  if (sourceFolderPolicy && actor === ActorType.USER) {
    // if secret approval policy exists for source, we create the secret approval request
    const localSecretsIds = decryptedSourceSecrets.map(({ id }) => id);
    const latestSecretVersions = await secretVersionDAL.findLatestVersionMany(sourceFolder.id, localSecretsIds, tx);
    const approvalRequestDoc = await secretApprovalRequestDAL.create(
      {
        folderId: sourceFolder.id,
        slug: alphaNumericNanoId(),
        policyId: sourceFolderPolicy.id,
        status: "open",
        hasMerged: false,
        committerUserId: actorId
      },
      tx
    );

    const commits = locallyDeletedSecrets.map((doc) => {
      const { operation } = doc;
      const localSecret = sourceSecretsGroupByKey[doc.key]?.[0];

      return {
        op: operation,
        requestId: approvalRequestDoc.id,
        metadata: doc.metadata,
        key: doc.key,
        encryptedComment: doc.encryptedComment,
        encryptedValue: doc.encryptedValue,
        skipMultilineEncoding: doc.skipMultilineEncoding,
        secretId: localSecret.id,
        secretVersion: latestSecretVersions[localSecret.id].id
      };
    });

    await secretApprovalRequestSecretDAL.insertV2Bridge(commits, tx);
  } else {
    // if no secret approval policy is present, we delete directly.
    await secretDAL.delete(
      {
        $in: {
          id: locallyDeletedSecrets.map(({ id }) => id)
        },
        folderId: sourceFolder.id
      },
      tx
    );

    isSourceUpdated = true;
  }

  // update references to the moved secrets whenever the destination was updated directly.
  // this ensures references are updated regardless of whether the source has an approval policy.
  // the secrets now exist at the destination, so references should point there.
  if (isDestinationUpdated) {
    for await (const secret of decryptedSourceSecrets) {
      const destinationSecretId = destinationSecretIdByKey[secret.key];
      if (!destinationSecretId) {
        // eslint-disable-next-line no-continue
        continue;
      }

      await fnUpdateMovedSecretReferences({
        orgId: actorOrgId,
        projectId,
        sourceEnvironment,
        sourceSecretPath,
        sourceFolderId: sourceFolder.id,
        destinationEnvironment,
        destinationSecretPath,
        destinationFolderId: destinationFolder.id,
        secretKey: secret.key,
        secretId: destinationSecretId,
        secretDAL,
        secretVersionDAL,
        folderCommitService,
        folderDAL,
        secretQueueService,
        encryptor: ({ plainText }) => secretManagerEncryptor({ plainText }),
        decryptor: ({ cipherTextBlob }) => secretManagerDecryptor({ cipherTextBlob }),
        generateSecretBlindIndex,
        tx
      });
    }
  }

  return {
    isSourceUpdated,
    isDestinationUpdated,
    sourceFolder,
    destinationFolder
  };
};

// performs the move within a caller-supplied transaction and returns the result without side effects.
// external callers (e.g. folder move) use this to run several moves inside one transaction, then call
// dispatchSecretMoveSideEffects + invalidateSecretCacheByProjectId afterwards.
export const fnSecretMoveInTransaction = async (dto: TFnSecretMoveInTransaction): Promise<TFnSecretMoveResult> => {
  const { actorAuthMethod, permissionService, ...fnSecretMoveDTO } = dto;

  const { permission } = await permissionService.getProjectPermission({
    actor: dto.actor,
    actorId: dto.actorId,
    projectId: dto.projectId,
    actorAuthMethod,
    actorOrgId: dto.actorOrgId,
    actionProjectType: ActionProjectType.SecretManager
  });

  return fnSecretMove({ ...fnSecretMoveDTO, permission });
};
