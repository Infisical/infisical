import path from "node:path";

import { Knex } from "knex";
import RE2 from "re2";

import { SecretType, TableName, TSecretFolders, TSecretsV2 } from "@app/db/schemas";
import { NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { ActorType } from "../auth/auth-type";
import { CommitType, TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { ResourceMetadataWithEncryptionDTO } from "../resource-metadata/resource-metadata-schema";
import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "../secret/secret-fns";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretReminderRecipient } from "../secret-reminder-recipients/secret-reminder-recipients-types";
import { getAllSecretReferences } from "./secret-reference-fns";
import { TSecretV2BridgeDALFactory } from "./secret-v2-bridge-dal";
import { TFnSecretBulkDelete, TFnSecretBulkInsert, TFnSecretBulkUpdate } from "./secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "./secret-version-dal";

export const shouldUseSecretV2Bridge = (version: number) => version === 3;

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
      reminderRepeatDays
    }) => ({
      skipMultilineEncoding,
      type,
      key,
      userId,
      encryptedComment,
      version,
      reminderNote,
      encryptedValue,
      reminderRepeatDays
    })
  );

  const userActorId = actor && actor.type === ActorType.USER ? actor.actorId : undefined;
  const identityActorId = actor && actor.type === ActorType.IDENTITY ? actor.actorId : undefined;
  const actorType = actor?.type || ActorType.PLATFORM;

  const newSecrets = await secretDAL.insertMany(
    sanitizedInputSecrets.map((el) => ({ ...el, folderId })),
    tx
  );

  const newSecretGroupedByKeyName = groupBy(newSecrets, (item) => item.key);
  const newSecretTags = inputSecrets.flatMap(({ tagIds: secretTags = [], key }) =>
    secretTags.map((tag) => ({
      [`${TableName.SecretTag}Id` as const]: tag,
      [`${TableName.SecretV2}Id` as const]: newSecretGroupedByKeyName[key][0].id
    }))
  );

  const secretVersions = await secretVersionDAL.insertMany(
    sanitizedInputSecrets.map((el, index) => ({
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
      secretId: newSecretGroupedByKeyName[el.key][0].id
    })),
    tx
  );

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
    ({ filter, data: { skipMultilineEncoding, type, key, encryptedValue, userId, encryptedComment } }) => ({
      filter: { ...filter, folderId },
      data: {
        skipMultilineEncoding,
        type,
        key,
        userId,
        encryptedComment,
        encryptedValue
      }
    })
  );

  const newSecrets = await secretDAL.bulkUpdate(sanitizedInputSecrets, tx);
  const secretVersions = await secretVersionDAL.insertMany(
    newSecrets.map(
      (
        { skipMultilineEncoding, type, key, userId, encryptedComment, version, encryptedValue, id: secretId },
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
        folderId,
        secretId,
        userActorId,
        identityActorId,
        actorType
      })
    ),
    tx
  );

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

  // we track updated secrets grouped by folder for the commit creation
  const updatedSecretsByFolder: Map<string, Array<{ secret: TSecretsV2; newEncryptedValue: Buffer }>> = new Map();

  for await (const secretToUpdate of allSecretsToUpdate) {
    if (!secretToUpdate.encryptedValue) {
      // eslint-disable-next-line no-continue
      continue;
    }

    const originalValue = decryptor({ cipherTextBlob: secretToUpdate.encryptedValue }).toString();
    let newValue = originalValue;

    const { localReferences, nestedReferences } = getAllSecretReferences(originalValue);

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
      const newEncryptedValue = encryptor({ plainText: Buffer.from(newValue) }).cipherTextBlob;

      await secretDAL.updateById(secretToUpdate.id, { encryptedValue: newEncryptedValue }, tx);

      // group by folder for commit creation
      const folderSecrets = updatedSecretsByFolder.get(secretToUpdate.folderId) || [];
      folderSecrets.push({ secret: secretToUpdate, newEncryptedValue });
      updatedSecretsByFolder.set(secretToUpdate.folderId, folderSecrets);
    }
  }

  for await (const [updateFolderId, folderSecrets] of updatedSecretsByFolder) {
    const secretVersions = await secretVersionDAL.insertMany(
      folderSecrets.map(({ secret, newEncryptedValue }) => ({
        secretId: secret.id,
        version: secret.version + 1,
        key: secret.key,
        encryptedValue: newEncryptedValue,
        encryptedComment: secret.encryptedComment,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        type: secret.type,
        metadata: secret.metadata,
        folderId: secret.folderId,
        userId: secret.userId,
        actorType: ActorType.PLATFORM
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
  tx
}: TFnUpdateMovedSecretReferences) => {
  const updatedSecretsByFolder: Map<string, Array<{ secret: TSecretsV2; newEncryptedValue: Buffer }>> = new Map();

  const destPathPart = destinationSecretPath === "/" ? "" : `.${destinationSecretPath.slice(1).replace(/\//g, ".")}`;
  const newNestedRef = `\${${destinationEnvironment}${destPathPart}.${secretKey}}`;

  // case: local references, not stored in the db, we need to scan the folder to find secrets that reference the old secret ky
  const secretsInSourceFolder = await secretDAL.find(
    {
      folderId: sourceFolderId,
      $notEqual: { [`${TableName.SecretV2}.id` as "id"]: secretId }
    },
    { tx }
  );

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
      const newEncryptedValue = encryptor({ plainText: Buffer.from(newValue) }).cipherTextBlob;

      await secretDAL.updateById(secretToUpdate.id, { encryptedValue: newEncryptedValue }, tx);

      // group by folder for commit creation
      const folderSecrets = updatedSecretsByFolder.get(secretToUpdate.folderId) || [];
      folderSecrets.push({ secret: secretToUpdate, newEncryptedValue });
      updatedSecretsByFolder.set(secretToUpdate.folderId, folderSecrets);

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
          const newEncryptedValue = encryptor({ plainText: Buffer.from(newValue) }).cipherTextBlob;

          await secretDAL.updateById(secretToUpdate.id, { encryptedValue: newEncryptedValue }, tx);

          const folderSecrets = updatedSecretsByFolder.get(secretToUpdate.folderId) || [];
          folderSecrets.push({ secret: secretToUpdate, newEncryptedValue });
          updatedSecretsByFolder.set(secretToUpdate.folderId, folderSecrets);

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
          const newEncryptedValue = encryptor({ plainText: Buffer.from(newValue) }).cipherTextBlob;

          await secretDAL.updateById(secretToUpdate.id, { encryptedValue: newEncryptedValue }, tx);

          const folderSecrets = updatedSecretsByFolder.get(secretToUpdate.folderId) || [];
          folderSecrets.push({ secret: secretToUpdate, newEncryptedValue });
          updatedSecretsByFolder.set(secretToUpdate.folderId, folderSecrets);

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

  for await (const [updateFolderId, folderSecrets] of updatedSecretsByFolder) {
    const secretVersions = await secretVersionDAL.insertMany(
      folderSecrets.map(({ secret, newEncryptedValue }) => ({
        secretId: secret.id,
        version: secret.version + 1,
        key: secret.key,
        encryptedValue: newEncryptedValue,
        encryptedComment: secret.encryptedComment,
        skipMultilineEncoding: secret.skipMultilineEncoding,
        type: secret.type,
        metadata: secret.metadata,
        folderId: secret.folderId,
        userId: secret.userId,
        actorType: ActorType.PLATFORM
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
            secretPath: folder.path,
            actor: ActorType.PLATFORM,
            actorId: ""
          });
        }
      })
    );
  }
};
