/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  ActionProjectType,
  TSecretFolders,
  TSecretFolderVersions,
  TSecretV2TagJunctionInsert,
  TSecretVersionsV2
} from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionCommitsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TFolderCheckpointDALFactory } from "../folder-checkpoint/folder-checkpoint-dal";
import { TFolderCheckpointResourcesDALFactory } from "../folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { TFolderCommitChangesDALFactory } from "../folder-commit-changes/folder-commit-changes-dal";
import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TFolderTreeCheckpointResourcesDALFactory } from "../folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";
import { TFolderCommitQueueServiceFactory } from "./folder-commit-queue";

export enum ChangeType {
  ADD = "add",
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create"
}

export enum CommitType {
  ADD = "add",
  DELETE = "delete"
}

export enum ResourceType {
  SECRET = "secret",
  FOLDER = "folder"
}

export type TCommitResourceChangeDTO = {
  type: string;
  secretVersionId?: string;
  folderVersionId?: string;
  isUpdate?: boolean;
  folderId?: string;
};

type TCreateCommitDTO = {
  actor: {
    type: string;
    metadata?: {
      name?: string;
      id?: string;
    };
  };
  message?: string;
  folderId: string;
  changes: TCommitResourceChangeDTO[];
  omitIgnoreFilter?: boolean;
};

type TCommitChangeDTO = {
  folderCommitId: string;
  changeType: string;
  secretVersionId?: string;
  folderVersionId?: string;
};

type BaseChange = {
  id: string;
  versionId: string;
  oldVersionId?: string;
  changeType: ChangeType;
  commitId: bigint;
  createdAt?: Date;
  parentId?: string;
  isUpdate?: boolean;
  fromVersion?: string;
};

type SecretChange = BaseChange & {
  type: ResourceType.SECRET;
  secretKey: string;
  secretVersion: string;
  secretId: string;
  versions?: {
    secretKey?: string;
    secretComment?: string;
    skipMultilineEncoding?: boolean | null;
    metadata?: unknown;
    tags?: string[] | null;
    secretValue?: string;
  }[];
};

type FolderChange = BaseChange & {
  type: ResourceType.FOLDER;
  folderName: string;
  folderVersion: string;
  versions?: {
    name: string;
    description?: string | null;
  }[];
};

type SecretTargetChange = {
  type: ResourceType.SECRET;
  id: string;
  versionId: string;
  secretKey: string;
  secretVersion: string;
  fromVersion?: string;
};

type FolderTargetChange = {
  type: ResourceType.FOLDER;
  id: string;
  versionId: string;
  folderName: string;
  folderVersion: string;
  fromVersion?: string;
};

export type ResourceChange = SecretChange | FolderChange;

type ActorInfo = {
  actorType: string;
  actorId?: string;
  message?: string;
};

type StateChangeResult = {
  secretChangesCount: number;
  folderChangesCount: number;
  totalChanges: number;
};

type TFolderCommitServiceFactoryDep = {
  folderCommitDAL: TFolderCommitDALFactory;
  folderCommitChangesDAL: TFolderCommitChangesDALFactory;
  folderCheckpointDAL: TFolderCheckpointDALFactory;
  folderCheckpointResourcesDAL: TFolderCheckpointResourcesDALFactory;
  folderTreeCheckpointDAL: TFolderTreeCheckpointDALFactory;
  folderTreeCheckpointResourcesDAL: TFolderTreeCheckpointResourcesDALFactory;
  userDAL: TUserDALFactory;
  identityDAL: TIdentityDALFactory;
  folderDAL: TSecretFolderDALFactory;
  folderVersionDAL: TSecretFolderVersionDALFactory;
  secretVersionV2BridgeDAL: TSecretVersionV2DALFactory;
  secretV2BridgeDAL: TSecretV2BridgeDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectByEnvId">;
  folderCommitQueueService?: Pick<
    TFolderCommitQueueServiceFactory,
    "scheduleTreeCheckpoint" | "createFolderTreeCheckpoint"
  >;
  permissionService?: TPermissionServiceFactory;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretTagDAL: Pick<
    TSecretTagDALFactory,
    | "findSecretTagsByVersionId"
    | "saveTagsToSecretV2"
    | "findSecretTagsBySecretId"
    | "deleteTagsToSecretV2"
    | "saveTagsToSecretVersionV2"
  >;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "find" | "insertMany" | "delete">;
};

export const folderCommitServiceFactory = ({
  folderCommitDAL,
  folderCommitChangesDAL,
  folderCheckpointDAL,
  folderTreeCheckpointDAL,
  folderCheckpointResourcesDAL,
  userDAL,
  identityDAL,
  folderDAL,
  folderVersionDAL,
  secretVersionV2BridgeDAL,
  projectDAL,
  secretV2BridgeDAL,
  folderTreeCheckpointResourcesDAL,
  folderCommitQueueService,
  permissionService,
  kmsService,
  secretTagDAL,
  resourceMetadataDAL
}: TFolderCommitServiceFactoryDep) => {
  const appCfg = getConfig();

  const checkProjectCommitReadPermission = async ({
    actor,
    actorId,
    projectId,
    actorAuthMethod,
    actorOrgId
  }: {
    actor: ActorType;
    actorId: string;
    projectId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    if (!permissionService) {
      throw new Error("Permission service not initialized");
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionCommitsActions.Read, ProjectPermissionSub.Commits);
  };

  /**
   * Fetches all resources within a folder
   */
  const getFolderResources = async (folderId: string, tx?: Knex) => {
    const resources = [];
    const subFolders = await folderDAL.findByParentId(folderId, tx);

    if (subFolders.length > 0) {
      const subFolderIds = subFolders.map((folder) => folder.id);
      const folderVersions = await folderVersionDAL.findLatestFolderVersions(subFolderIds, tx);
      resources.push(
        ...Object.values(folderVersions).map((folderVersion) => ({
          folderVersionId: folderVersion.id,
          secretVersionId: undefined
        }))
      );
    }

    const secretVersions = await secretVersionV2BridgeDAL.findLatestVersionByFolderId(folderId, tx);
    if (secretVersions.length > 0) {
      resources.push(
        ...secretVersions.map((secretVersion) => ({ secretVersionId: secretVersion.id, folderVersionId: undefined }))
      );
    }

    return resources;
  };

  /**
   * Creates a checkpoint for a folder if necessary
   */
  const createFolderCheckpoint = async ({
    folderId,
    folderCommitId,
    force = false,
    tx
  }: {
    folderId: string;
    folderCommitId?: string;
    force?: boolean;
    tx?: Knex;
  }) => {
    let latestCommitId = folderCommitId;
    const latestCheckpoint = await folderCheckpointDAL.findLatestByFolderId(folderId, tx);

    if (!latestCommitId) {
      const latestCommit = await folderCommitDAL.findLatestCommit(folderId, undefined, tx);
      if (!latestCommit) {
        throw new BadRequestError({ message: "Latest commit ID not found" });
      }
      latestCommitId = latestCommit.id;
    }

    if (!force && latestCheckpoint) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getNumberOfCommitsSince(
        folderId,
        latestCheckpoint.folderCommitId,
        tx
      );
      if (commitsSinceLastCheckpoint < Number(appCfg.PIT_CHECKPOINT_WINDOW)) {
        return;
      }
    }

    const checkpointResources = await getFolderResources(folderId, tx);

    const newCheckpoint = await folderCheckpointDAL.create(
      {
        folderCommitId: latestCommitId
      },
      tx
    );
    const batchSize = 500;
    const chunks = chunkArray(checkpointResources, batchSize);

    await Promise.all(
      chunks.map(async (chunk) => {
        await folderCheckpointResourcesDAL.insertMany(
          chunk.map((resource) => ({ folderCheckpointId: newCheckpoint.id, ...resource })),
          tx
        );
      })
    );

    return latestCommitId;
  };

  /**
   * Reconstructs the state of a folder at a specific commit
   */
  const reconstructFolderState = async (
    folderCommitId: string,
    tx?: Knex
  ): Promise<(SecretTargetChange | FolderTargetChange)[]> => {
    const targetCommit = await folderCommitDAL.findById(folderCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `Commit with ID ${folderCommitId} not found` });
    }

    const nearestCheckpoint = await folderCheckpointDAL.findNearestCheckpoint(
      targetCommit.commitId,
      targetCommit.folderId,
      tx
    );
    if (!nearestCheckpoint) {
      throw new NotFoundError({ message: `Nearest checkpoint not found for commit ${folderCommitId}` });
    }

    const checkpointResources = await folderCheckpointResourcesDAL.findByCheckpointId(nearestCheckpoint.id, tx);

    const folderState: Record<string, SecretTargetChange | FolderTargetChange> = {};

    // Add all checkpoint resources to initial state
    checkpointResources.forEach((resource) => {
      if (resource.secretVersionId && resource.referencedSecretId) {
        folderState[`secret-${resource.referencedSecretId}`] = {
          type: ResourceType.SECRET,
          id: resource.referencedSecretId,
          versionId: resource.secretVersionId,
          secretKey: resource.secretKey,
          secretVersion: resource.secretVersion
        } as SecretTargetChange;
      } else if (resource.folderVersionId && resource.referencedFolderId) {
        folderState[`folder-${resource.referencedFolderId}`] = {
          type: ResourceType.FOLDER,
          id: resource.referencedFolderId,
          versionId: resource.folderVersionId,
          folderName: resource.folderName,
          folderVersion: resource.folderVersion
        } as FolderTargetChange;
      }
    });

    const commitsToRecreate = await folderCommitDAL.findCommitsToRecreate(
      targetCommit.folderId,
      targetCommit.commitId,
      nearestCheckpoint.commitId,
      tx
    );

    // Process commits to recreate final state
    for (const commit of commitsToRecreate) {
      // eslint-disable-next-line no-continue
      if (!commit.changes) continue;

      for (const change of commit.changes) {
        if (change.secretVersionId && change.referencedSecretId) {
          const key = `secret-${change.referencedSecretId}`;

          if (change.changeType.toLowerCase() === "add") {
            folderState[key] = {
              type: ResourceType.SECRET,
              id: change.referencedSecretId,
              versionId: change.secretVersionId,
              secretKey: change.secretKey,
              secretVersion: change.secretVersion
            } as SecretTargetChange;
          } else if (change.changeType.toLowerCase() === "delete") {
            delete folderState[key];
          }
        } else if (change.folderVersionId && change.referencedFolderId) {
          const key = `folder-${change.referencedFolderId}`;

          if (change.changeType.toLowerCase() === "add") {
            folderState[key] = {
              type: ResourceType.FOLDER,
              id: change.referencedFolderId,
              versionId: change.folderVersionId,
              folderName: change.folderName,
              folderVersion: change.folderVersion
            } as FolderTargetChange;
          } else if (change.changeType.toLowerCase() === "delete") {
            delete folderState[key];
          }
        }
      }
    }
    return Object.values(folderState);
  };

  /**
   * Compares folder states between two commits and returns the differences
   */
  const compareFolderStates = async ({
    currentCommitId,
    targetCommitId,
    defaultOperation = "create",
    tx
  }: {
    currentCommitId?: string;
    targetCommitId: string;
    defaultOperation?: "create" | "update" | "delete";
    tx?: Knex;
  }): Promise<ResourceChange[]> => {
    const targetCommit = await folderCommitDAL.findById(targetCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `Commit with ID ${targetCommitId} not found` });
    }

    const project = await projectDAL.findProjectByEnvId(targetCommit.envId, tx);

    if (!project) {
      throw new NotFoundError({ message: `No project found for envId ${targetCommit.envId}` });
    }

    // If currentCommitId is not provided, mark all resources in target as creates
    if (!currentCommitId) {
      const targetState = await reconstructFolderState(targetCommitId, tx);

      return targetState
        .map((resource): ResourceChange | null => {
          if (resource.type === ResourceType.SECRET) {
            return {
              type: ResourceType.SECRET,
              id: resource.id,
              versionId: resource.versionId,
              changeType: defaultOperation as ChangeType,
              commitId: targetCommit.commitId,
              secretKey: resource.secretKey,
              secretVersion: resource.secretVersion,
              secretId: resource.id
            };
          }
          if (resource.type === ResourceType.FOLDER) {
            return {
              type: ResourceType.FOLDER,
              id: resource.id,
              versionId: resource.versionId,
              changeType: defaultOperation as ChangeType,
              commitId: targetCommit.commitId,
              folderName: resource.folderName,
              folderVersion: resource.folderVersion
            };
          }
          return null;
        })
        .filter((change): change is ResourceChange => !!change);
    }

    // Original logic for when currentCommitId is provided
    const currentState = await reconstructFolderState(currentCommitId, tx);
    const targetState = await reconstructFolderState(targetCommitId, tx);

    // Create lookup maps for easier comparison
    const currentMap: Record<string, SecretTargetChange | FolderTargetChange> = {};
    const targetMap: Record<
      string,
      {
        type: string;
        id: string;
        versionId: string;
        secretKey?: string;
        secretVersion?: string;
        folderName?: string;
        folderVersion?: string;
        fromVersion?: string;
      }
    > = {};

    // Build lookup maps
    currentState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      currentMap[key] = resource;
    });

    targetState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      targetMap[key] = resource;
    });

    // Track differences
    const differences: ResourceChange[] = [];

    // Find deletes and updates
    Object.keys(currentMap).forEach((key) => {
      const currentResource = currentMap[key];
      const targetResource = targetMap[key];

      if (!targetResource) {
        // Resource was deleted
        if (currentResource.type === ResourceType.SECRET) {
          differences.push({
            type: ResourceType.SECRET,
            id: currentResource.id,
            versionId: currentResource.versionId,
            changeType: ChangeType.DELETE,
            commitId: targetCommit.commitId,
            secretKey: currentResource.secretKey,
            secretVersion: currentResource.secretVersion,
            secretId: currentResource.id,
            fromVersion: currentResource.versionId
          });
        } else if (currentResource.type === ResourceType.FOLDER) {
          differences.push({
            type: ResourceType.FOLDER,
            id: currentResource.id,
            versionId: currentResource.versionId,
            changeType: ChangeType.DELETE,
            commitId: targetCommit.commitId,
            folderName: currentResource.folderName,
            folderVersion: currentResource.folderVersion,
            fromVersion: currentResource.versionId
          });
        }
      } else if (currentResource.versionId !== targetResource.versionId) {
        // Resource was updated
        if (targetResource.type === ResourceType.SECRET) {
          const secretCurrentResource = currentResource as SecretTargetChange;
          const secretTargetResource = targetResource as SecretTargetChange;
          differences.push({
            type: ResourceType.SECRET,
            id: secretTargetResource.id,
            versionId: secretTargetResource.versionId,
            changeType: ChangeType.UPDATE,
            commitId: targetCommit.commitId,
            secretKey: secretTargetResource.secretKey,
            secretVersion: secretTargetResource.secretVersion,
            secretId: secretTargetResource.id,
            fromVersion: secretCurrentResource.secretVersion
          });
        } else if (targetResource.type === ResourceType.FOLDER) {
          const folderCurrentResource = currentResource as FolderTargetChange;
          const folderTargetResource = targetResource as FolderTargetChange;

          differences.push({
            type: ResourceType.FOLDER,
            id: folderTargetResource.id,
            versionId: folderTargetResource.versionId,
            changeType: ChangeType.UPDATE,
            commitId: targetCommit.commitId,
            folderName: folderTargetResource.folderName,
            folderVersion: folderTargetResource.folderVersion,
            fromVersion: folderCurrentResource.folderVersion
          });
        }
      }
    });

    // Find new resources
    Object.keys(targetMap).forEach((key) => {
      if (!currentMap[key]) {
        const targetResource = targetMap[key];
        if (targetResource.type === ResourceType.SECRET) {
          const secretTargetResource = targetResource as SecretTargetChange;
          differences.push({
            type: ResourceType.SECRET,
            id: secretTargetResource.id,
            versionId: secretTargetResource.versionId,
            changeType: ChangeType.CREATE,
            commitId: targetCommit.commitId,
            createdAt: targetCommit.createdAt,
            secretKey: secretTargetResource.secretKey,
            secretVersion: secretTargetResource.secretVersion,
            secretId: secretTargetResource.id
          });
        } else if (targetResource.type === ResourceType.FOLDER) {
          const folderTargetResource = targetResource as FolderTargetChange;
          differences.push({
            type: ResourceType.FOLDER,
            id: folderTargetResource.id,
            versionId: folderTargetResource.versionId,
            changeType: ChangeType.CREATE,
            commitId: targetCommit.commitId,
            createdAt: targetCommit.createdAt,
            folderName: folderTargetResource.folderName,
            folderVersion: folderTargetResource.folderVersion
          });
        }
      }
    });

    const removeNoChangeUpdate: string[] = [];

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: project.id
    });

    await Promise.all(
      differences.map(async (change) => {
        if (change.changeType === ChangeType.UPDATE) {
          if (change.type === ResourceType.FOLDER && change.folderVersion && change.fromVersion) {
            const versions = await folderVersionDAL.find({
              folderId: change.id,
              $in: {
                version: [Number(change.folderVersion), Number(change.fromVersion)]
              }
            });
            const versionsShaped = versions.map((version) => ({
              name: version.name,
              description: version.description
            }));
            const uniqueVersions = versionsShaped.filter(
              (item, index, arr) =>
                arr.findIndex((other) =>
                  Object.entries(item).every(
                    ([key, value]) => JSON.stringify(value) === JSON.stringify(other[key as keyof typeof other])
                  )
                ) === index
            );
            if (uniqueVersions.length === 1) {
              removeNoChangeUpdate.push(change.id);
            }
          } else if (change.type === ResourceType.SECRET && change.secretVersion && change.fromVersion) {
            const versions = await secretVersionV2BridgeDAL.findVersionsBySecretIdWithActors({
              secretId: change.id,
              projectId: project.id,
              secretVersions: [change.secretVersion, change.fromVersion]
            });
            const versionsShaped = versions.map((el) => ({
              secretKey: el.key,
              secretComment: el.encryptedComment
                ? secretManagerDecryptor({ cipherTextBlob: el.encryptedComment }).toString()
                : "",
              skipMultilineEncoding: el.skipMultilineEncoding,
              secretReminderRepeatDays: el.reminderRepeatDays,
              tags: el.tags,
              metadata: el.metadata,
              secretReminderNote: el.reminderNote,
              secretValue: el.encryptedValue
                ? secretManagerDecryptor({ cipherTextBlob: el.encryptedValue }).toString()
                : ""
            }));
            const uniqueVersions = versionsShaped.filter(
              (item, index, arr) =>
                arr.findIndex((other) =>
                  Object.entries(item).every(
                    ([key, value]) => JSON.stringify(value) === JSON.stringify(other[key as keyof typeof other])
                  )
                ) === index
            );
            if (uniqueVersions.length === 1) {
              removeNoChangeUpdate.push(change.id);
            }
          }
        }
      })
    );
    return differences.filter((change) => !removeNoChangeUpdate.includes(change.id));
  };

  /**
   * Adds a change to an existing commit
   */
  const addCommitChange = async (data: TCommitChangeDTO, tx?: Knex) => {
    try {
      if (!data.secretVersionId && !data.folderVersionId) {
        throw new BadRequestError({ message: "Either secretVersionId or folderVersionId must be provided" });
      }

      const commit = await folderCommitDAL.findById(data.folderCommitId, tx);
      if (!commit) {
        throw new NotFoundError({ message: `Commit with ID ${data.folderCommitId} not found` });
      }

      return await folderCommitChangesDAL.create(data, tx);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new DatabaseError({ error, name: "AddCommitChange" });
    }
  };

  const createDeleteCommitForNestedFolders = async ({
    folderId,
    actorMetadata,
    actorType,
    envId,
    parentFolderName,
    step = 1,
    tx
  }: {
    folderId: string;
    actorMetadata: Record<string, string>;
    actorType: string;
    envId: string;
    parentFolderName: string;
    step?: number;
    tx?: Knex;
  }) => {
    if (step > 20) {
      logger.info(`createDeleteCommitForNestedFolders - Max step reached for folder ${folderId}`);
      return;
    }
    logger.info(`Creating delete commit for nested folders ${folderId}`);
    const folderVersion = await folderVersionDAL.findLatestVersion(folderId, tx);
    if (!folderVersion) {
      logger.info(`No folder version found for ${folderId}`);
      return;
    }
    const lastFolderCommit = await folderCommitDAL.findLatestCommit(folderId, undefined, tx);
    if (!lastFolderCommit) {
      logger.info(`No commit found for folder ${folderId}`);
      return;
    }
    const folderState = await reconstructFolderState(lastFolderCommit.id, tx);
    const changes = folderState.map((resource) => ({
      type: ChangeType.DELETE,
      folderId: resource.id,
      folderName: resource.type === ResourceType.FOLDER ? resource.folderName : undefined,
      secretVersionId: resource.type === ResourceType.SECRET ? resource.versionId : undefined,
      folderVersionId: resource.type === ResourceType.FOLDER ? resource.versionId : undefined,
      secretKey: resource.type === ResourceType.SECRET ? resource.secretKey : undefined
    }));
    logger.info(`Found ${changes.length} changes for ${folderId}`);

    const newCommit = await folderCommitDAL.create(
      {
        actorMetadata,
        actorType,
        message: `Parent folder ${parentFolderName} deleted`,
        folderId,
        envId
      },
      tx
    );

    const batchSize = 500;
    const chunks = chunkArray(changes, batchSize);

    await Promise.all(
      chunks.map(async (chunk) => {
        await folderCommitChangesDAL.insertMany(
          chunk.map((change) => ({
            folderCommitId: newCommit.id,
            changeType: CommitType.DELETE,
            secretVersionId: change.secretVersionId,
            folderVersionId: change.folderVersionId,
            isUpdate: false
          })),
          tx
        );
      })
    );

    await Promise.all(
      changes
        .filter((change) => change.type === ChangeType.DELETE && change.folderVersionId)
        .map(async (change) => {
          await createDeleteCommitForNestedFolders({
            folderId: change.folderId,
            actorMetadata,
            actorType,
            envId,
            parentFolderName: folderVersion.name,
            step: step + 1,
            tx
          });
        })
    );
  };

  const compareSecretVersions = async (
    version1: TSecretVersionsV2 & { tags: { id: string }[] },
    version2: TSecretVersionsV2 & { tags: { id: string }[] },
    projectId: string
  ) => {
    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });
    const objectsEqual = (o1: unknown, o2: unknown): boolean => {
      if (typeof o1 !== "object" || o1 === null || typeof o2 !== "object" || o2 === null) {
        return o1 === o2;
      }

      const obj1 = o1 as Record<string, unknown>;
      const obj2 = o2 as Record<string, unknown>;
      return (
        Object.keys(obj1).length === Object.keys(obj2).length && Object.keys(obj1).every((p) => obj1[p] === obj2[p])
      );
    };

    const arraysEqual = (a1: unknown[], a2: unknown[]) =>
      a1.length === a2.length && a1.every((obj1) => a2.some((obj2) => objectsEqual(obj1, obj2)));

    const version1Reshaped = {
      ...version1,
      encryptedValue: version1.encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: version1.encryptedValue }).toString()
        : "",
      encryptedComment: version1.encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: version1.encryptedComment }).toString()
        : "",
      metadata: Array.isArray(version1.metadata) ? (version1.metadata as { key: string; value: string }[]) : [],
      tags: version1.tags.map((tag) => tag.id)
    };
    const version2Reshaped = {
      ...version2,
      encryptedValue: version2.encryptedValue
        ? secretManagerDecryptor({ cipherTextBlob: version2.encryptedValue }).toString()
        : "",
      encryptedComment: version2.encryptedComment
        ? secretManagerDecryptor({ cipherTextBlob: version2.encryptedComment }).toString()
        : "",
      metadata: Array.isArray(version2.metadata) ? (version2.metadata as { key: string; value: string }[]) : [],
      tags: version2.tags.map((tag) => tag.id)
    };
    return (
      version1Reshaped.key === version2Reshaped.key &&
      version1Reshaped.encryptedValue === version2Reshaped.encryptedValue &&
      version1Reshaped.encryptedComment === version2Reshaped.encryptedComment &&
      version1Reshaped.skipMultilineEncoding === version2Reshaped.skipMultilineEncoding &&
      arraysEqual(version1Reshaped.metadata, version2Reshaped.metadata) &&
      version1Reshaped.tags.length === version2Reshaped.tags.length &&
      version1Reshaped.tags.every((tag) => version2Reshaped.tags.includes(tag))
    );
  };

  const filterIgnoredChanges = async (
    changes: {
      type: string;
      secretVersionId?: string;
      folderVersionId?: string;
      isUpdate?: boolean;
      folderId?: string;
    }[],
    projectId: string,
    tx?: Knex
  ) => {
    let filteredChanges = [...changes];
    for (const change of changes) {
      if (change.type === ChangeType.ADD && change.isUpdate && change.secretVersionId) {
        const secretVersions = await secretVersionV2BridgeDAL.findByIdAndPreviousVersion(change.secretVersionId, tx);
        const comparison = await compareSecretVersions(secretVersions[0], secretVersions[1], projectId);
        if (comparison) {
          filteredChanges = filteredChanges.filter(
            (filteredChange) => filteredChange.secretVersionId !== change.secretVersionId
          );
        }
      }
    }
    return filteredChanges;
  };

  /**
   * Creates a new commit with the provided changes
   */
  const createCommit = async (data: TCreateCommitDTO, tx?: Knex) => {
    try {
      const { metadata = {} } = data.actor;

      if (data.actor.type === ActorType.USER && data.actor.metadata?.id) {
        const user = await userDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = user?.username;
      }

      if (data.actor.type === ActorType.IDENTITY && data.actor.metadata?.id) {
        const identity = await identityDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = identity?.name;
      }

      const folder = await folderDAL.findById(data.folderId, tx);
      if (!folder) {
        throw new NotFoundError({ message: `Folder with ID ${data.folderId} not found` });
      }

      let { changes } = data;
      if (!data.omitIgnoreFilter) {
        const project = await projectDAL.findProjectByEnvId(folder.envId, tx);

        if (!project) {
          return;
        }

        changes = await filterIgnoredChanges(data.changes, project.id, tx);
        if (changes.length === 0) {
          return;
        }
      }

      const newCommit = await folderCommitDAL.create(
        {
          actorMetadata: metadata,
          actorType: data.actor.type,
          message: data.message,
          folderId: data.folderId,
          envId: folder.envId
        },
        tx
      );

      const batchSize = 500;
      const chunks = chunkArray(changes, batchSize);

      await Promise.all(
        chunks.map(async (chunk) => {
          await folderCommitChangesDAL.insertMany(
            chunk.map((change) => ({
              folderCommitId: newCommit.id,
              changeType: change.type,
              secretVersionId: change.secretVersionId,
              folderVersionId: change.folderVersionId,
              isUpdate: change.isUpdate || false
            })),
            tx
          );
        })
      );

      await Promise.all(
        changes.map(async (change) => {
          if (change.type === ChangeType.DELETE && change.folderId) {
            await createDeleteCommitForNestedFolders({
              folderId: change.folderId,
              actorMetadata: metadata,
              actorType: data.actor.type,
              envId: folder.envId,
              parentFolderName: folder.name,
              tx
            });
          }
        })
      );

      await createFolderCheckpoint({ folderId: data.folderId, folderCommitId: newCommit.id, tx });
      if (folderCommitQueueService) {
        if (!folder.parentId) {
          const previousTreeCommit = await folderTreeCheckpointDAL.findLatestByEnvId(folder.envId);
          if (!previousTreeCommit) {
            await folderCommitQueueService.createFolderTreeCheckpoint(folder.envId, newCommit.id, tx);
          }
        }
        await folderCommitQueueService.scheduleTreeCheckpoint(folder.envId);
      }
      return newCommit;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new DatabaseError({ error, name: "CreateCommit" });
    }
  };

  /**
   * Process secret changes when applying folder state differences
   */
  const processSecretChanges = async (
    changes: ResourceChange[],
    secretVersions: Record<string, TSecretVersionsV2>,
    actorInfo: ActorInfo,
    folderId: string,
    tx?: Knex
  ) => {
    const commitChanges = [];
    const folder = await folderDAL.findById(folderId, tx);
    if (!folder) {
      return [];
    }
    const project = await projectDAL.findById(folder.projectId, tx);

    // Filter only secret changes using discriminated union
    const secretChanges = changes.filter(
      (change): change is ResourceChange & SecretChange => change.type === ResourceType.SECRET
    );

    // Collect all secretIds for batch lookup
    const secretIds = secretChanges.map((change) => secretVersions[change.id]?.secretId).filter(Boolean);

    // Fetch all latest versions in one call
    const latestVersionsMap = await secretVersionV2BridgeDAL.findLatestVersionMany(folderId, secretIds, tx);

    for (const change of secretChanges) {
      const secretVersion = secretVersions[change.id];
      // eslint-disable-next-line no-continue
      if (!secretVersion) continue;

      // Get the latest version from our batch result
      const latestVersion = latestVersionsMap[secretVersion.secretId];
      const nextVersion = latestVersion ? latestVersion.version + 1 : 1;

      switch (change.changeType) {
        case "create":
          {
            const newSecret = [
              {
                id: change.id,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                version: nextVersion,
                type: secretVersion.type,
                key: secretVersion.key,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                encryptedValue: secretVersion.encryptedValue,
                encryptedComment: secretVersion.encryptedComment,
                userId: secretVersion.userId,
                folderId
              }
            ];
            await secretV2BridgeDAL.insertMany(newSecret, tx);

            const metadata: { key: string; value?: string; encryptedValue?: string }[] =
              (secretVersion.metadata as { key: string; value?: string; encryptedValue?: string }[]) || [];
            if (metadata.length > 0) {
              await resourceMetadataDAL.insertMany(
                metadata.map(({ key, value, encryptedValue }) => ({
                  key,
                  value,
                  encryptedValue: encryptedValue ? Buffer.from(encryptedValue, "base64") : null,
                  secretId: change.id,
                  orgId: project.orgId
                })),
                tx
              );
            }

            const newVersion = await secretVersionV2BridgeDAL.create(
              {
                folderId,
                secretId: secretVersion.secretId,
                version: nextVersion,
                encryptedValue: secretVersion.encryptedValue,
                key: secretVersion.key,
                encryptedComment: secretVersion.encryptedComment,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                userId: secretVersion.userId,
                actorType: actorInfo.actorType,
                envId: secretVersion.envId,
                metadata: JSON.stringify(metadata),
                ...(actorInfo.actorType === ActorType.IDENTITY && { identityActorId: actorInfo.actorId }),
                ...(actorInfo.actorType === ActorType.USER && { userActorId: actorInfo.actorId })
              },
              tx
            );

            const secretTagsToBeInsert: TSecretV2TagJunctionInsert[] = [];
            const secretTags = await secretTagDAL.findSecretTagsByVersionId(secretVersion.id, tx);
            secretTags.forEach((tag) => {
              secretTagsToBeInsert.push({ secrets_v2Id: change.id, secret_tagsId: tag.secret_tagsId });
            });
            await secretTagDAL.saveTagsToSecretV2(secretTagsToBeInsert, tx);
            await secretTagDAL.saveTagsToSecretVersionV2(
              secretTagsToBeInsert.map((tag) => ({
                secret_tagsId: tag.secret_tagsId,
                secret_versions_v2Id: newVersion.id
              })),
              tx
            );

            commitChanges.push({
              type: ChangeType.ADD,
              secretVersionId: newVersion.id
            });
          }
          break;

        case "update":
          {
            await secretV2BridgeDAL.updateById(
              change.id,
              {
                skipMultilineEncoding: secretVersion?.skipMultilineEncoding,
                version: nextVersion,
                type: secretVersion?.type,
                key: secretVersion?.key,
                reminderNote: secretVersion?.reminderNote,
                reminderRepeatDays: secretVersion?.reminderRepeatDays,
                encryptedValue: secretVersion?.encryptedValue,
                encryptedComment: secretVersion?.encryptedComment,
                userId: secretVersion?.userId
              },
              tx
            );

            const metadata: { key: string; value?: string; encryptedValue?: string }[] =
              (secretVersion.metadata as { key: string; value?: string; encryptedValue?: string }[]) || [];
            await resourceMetadataDAL.delete({ secretId: change.id }, tx);
            if (metadata.length > 0) {
              await resourceMetadataDAL.insertMany(
                metadata.map(({ key, value, encryptedValue }) => ({
                  key,
                  encryptedValue: encryptedValue ? Buffer.from(encryptedValue, "base64") : null,
                  value,
                  secretId: change.id,
                  orgId: project.orgId
                })),
                tx
              );
            }

            const newVersion = await secretVersionV2BridgeDAL.create(
              {
                version: nextVersion,
                encryptedValue: secretVersion.encryptedValue,
                key: secretVersion.key,
                encryptedComment: secretVersion.encryptedComment,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                userId: secretVersion.userId,
                metadata: JSON.stringify(metadata),
                actorType: actorInfo.actorType,
                envId: secretVersion.envId,
                folderId,
                secretId: secretVersion.secretId,
                ...(actorInfo.actorType === ActorType.IDENTITY && { identityActorId: actorInfo.actorId }),
                ...(actorInfo.actorType === ActorType.USER && { userActorId: actorInfo.actorId })
              },
              tx
            );

            let secretTagsToBeInsert: TSecretV2TagJunctionInsert[] = [];
            const secretTagsToBeDelete: string[] = [];
            const secretTags = await secretTagDAL.findSecretTagsByVersionId(secretVersion.id, tx);
            secretTags.forEach((tag) => {
              secretTagsToBeInsert.push({ secrets_v2Id: change.id, secret_tagsId: tag.secret_tagsId });
            });
            const currentTags = await secretTagDAL.findSecretTagsBySecretId(change.id, tx);
            currentTags.forEach((tag) => {
              if (!secretTagsToBeInsert.find((t) => t.secret_tagsId === tag.secret_tagsId)) {
                secretTagsToBeDelete.push(tag.secret_tagsId);
                secretTagsToBeInsert = secretTagsToBeInsert.filter((t) => t.secret_tagsId !== tag.secret_tagsId);
              }
            });
            await secretTagDAL.saveTagsToSecretV2(secretTagsToBeInsert, tx);
            await secretTagDAL.saveTagsToSecretVersionV2(
              secretTagsToBeInsert.map((tag) => ({
                secret_tagsId: tag.secret_tagsId,
                secret_versions_v2Id: newVersion.id
              })),
              tx
            );
            await secretTagDAL.deleteTagsToSecretV2(
              { $in: { secret_tagsId: secretTagsToBeDelete }, secrets_v2Id: change.id },
              tx
            );

            commitChanges.push({
              type: ChangeType.ADD,
              isUpdate: true,
              secretVersionId: newVersion.id
            });
          }
          break;

        // Delete case remains unchanged
        case "delete":
          await secretV2BridgeDAL.deleteById(change.id, tx);
          commitChanges.push({
            type: ChangeType.DELETE,
            secretVersionId: change.versionId
          });
          break;

        default:
          throw new BadRequestError({ message: `Unknown change type: ${change.changeType}` });
      }
    }

    return commitChanges;
  };

  /**
   * Core function to apply folder state differences
   */
  const applyFolderStateDifferencesFn = async ({
    differences,
    actorInfo,
    folderId,
    projectId,
    reconstructNewFolders,
    reconstructUpToCommit,
    step = 0,
    tx
  }: {
    differences: ResourceChange[];
    actorInfo: ActorInfo;
    folderId: string;
    projectId: string;
    reconstructNewFolders: boolean;
    reconstructUpToCommit?: string;
    step: number;
    tx?: Knex;
  }): Promise<StateChangeResult> => {
    /**
     * Process folder changes when applying folder state differences
     */
    const processFolderChanges = async (
      changes: ResourceChange[],
      folderVersions: Record<string, TSecretFolderVersions>
    ) => {
      const commitChanges = [];

      // Filter only folder changes using discriminated union
      const folderChanges = changes.filter(
        (change): change is ResourceChange & FolderChange => change.type === ResourceType.FOLDER
      );

      for (const change of folderChanges) {
        const folderVersion = folderVersions[change.id];

        switch (change.changeType) {
          case "create":
            if (folderVersion) {
              const newFolder = {
                id: change.id,
                parentId: folderId,
                envId: folderVersion.envId,
                version: (folderVersion.version || 1) + 1,
                name: folderVersion.name,
                description: folderVersion.description
              };
              await folderDAL.create(newFolder, tx);

              const newFolderVersion = await folderVersionDAL.create(
                {
                  folderId: change.id,
                  version: (folderVersion.version || 1) + 1,
                  name: folderVersion.name,
                  description: folderVersion.description,
                  envId: folderVersion.envId
                },
                tx
              );

              if (reconstructNewFolders && reconstructUpToCommit && step < 20) {
                const subFolderLatestCommit = await folderCommitDAL.findLatestCommitBetween({
                  folderId: change.id,
                  endCommitId: reconstructUpToCommit,
                  tx
                });
                if (subFolderLatestCommit) {
                  const subFolderDiff = await compareFolderStates({
                    targetCommitId: subFolderLatestCommit.id,
                    tx
                  });
                  if (subFolderDiff?.length > 0) {
                    await applyFolderStateDifferencesFn({
                      differences: subFolderDiff,
                      actorInfo,
                      folderId: change.id,
                      projectId,
                      reconstructNewFolders,
                      reconstructUpToCommit,
                      step: step + 1,
                      tx
                    });
                  }
                }
              }

              commitChanges.push({
                type: ChangeType.ADD,
                folderVersionId: newFolderVersion.id
              });
            }
            break;

          case "update":
            if (change.versionId) {
              const latestVersionDetails = await folderVersionDAL.findByIdsWithLatestVersion(
                [change.id],
                [change.versionId],
                tx
              );
              if (latestVersionDetails && Object.keys(latestVersionDetails).length > 0) {
                const versionDetails = Object.values(latestVersionDetails)[0];
                await folderDAL.updateById(
                  change.id,
                  {
                    parentId: folderId,
                    envId: versionDetails.envId,
                    version: (versionDetails.version || 1) + 1,
                    name: versionDetails.name,
                    description: versionDetails.description
                  },
                  tx
                );

                const newFolderVersion = await folderVersionDAL.create(
                  {
                    folderId: change.id,
                    version: (versionDetails.version || 1) + 1,
                    name: versionDetails.name,
                    description: versionDetails.description,
                    envId: versionDetails.envId
                  },
                  tx
                );

                commitChanges.push({
                  type: ChangeType.ADD,
                  isUpdate: true,
                  folderVersionId: newFolderVersion.id
                });
              }
            }
            break;

          case "delete":
            await folderDAL.deleteById(change.id, tx);

            commitChanges.push({
              type: ChangeType.DELETE,
              folderVersionId: change.versionId,
              folderId: change.id
            });
            break;

          default:
            throw new BadRequestError({ message: `Unknown change type: ${change.changeType}` });
        }
      }
      return commitChanges;
    };

    // Group differences by type for more efficient processing using discriminated unions
    const secretChanges = differences.filter(
      (diff): diff is ResourceChange & SecretChange => diff.type === ResourceType.SECRET
    );
    const folderChanges = differences.filter(
      (diff): diff is ResourceChange & FolderChange => diff.type === ResourceType.FOLDER
    );

    // Batch fetch necessary data
    const secretVersions = await secretVersionV2BridgeDAL.findByIdsWithLatestVersion(
      folderId,
      secretChanges.map((diff) => diff.id),
      secretChanges.map((diff) => diff.versionId),
      tx
    );

    const folderVersions = await folderVersionDAL.findByIdsWithLatestVersion(
      folderChanges.map((diff) => diff.id),
      folderChanges.map((diff) => diff.versionId),
      tx
    );

    // Process changes in parallel
    const [secretCommitChanges, folderCommitChanges] = await Promise.all([
      processSecretChanges(differences, secretVersions, actorInfo, folderId, tx),
      processFolderChanges(differences, folderVersions)
    ]);

    // Combine all changes
    const allCommitChanges = [...secretCommitChanges, ...folderCommitChanges];

    // Create a commit with all the changes
    await createCommit(
      {
        actor: {
          type: actorInfo.actorType,
          metadata: { id: actorInfo.actorId }
        },
        message: actorInfo.message || "Rolled back folder state",
        folderId,
        changes: allCommitChanges,
        omitIgnoreFilter: true
      },
      tx
    );

    // Invalidate cache to reflect the changes
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId, tx);

    return {
      secretChangesCount: secretChanges.length,
      folderChangesCount: folderChanges.length,
      totalChanges: differences.length
    };
  };

  /**
   * Apply folder state differences with transaction handling
   */
  const applyFolderStateDifferences = async (params: {
    differences: ResourceChange[];
    actorInfo: ActorInfo;
    folderId: string;
    projectId: string;
    reconstructNewFolders: boolean;
    reconstructUpToCommit?: string;
    tx?: Knex;
  }): Promise<StateChangeResult> => {
    // If a transaction was provided, use it directly
    if (params.tx) {
      return applyFolderStateDifferencesFn({ ...params, step: 0 });
    }

    // Otherwise, start a new transaction
    return folderCommitDAL.transaction((newTx) => applyFolderStateDifferencesFn({ ...params, tx: newTx, step: 0 }));
  };

  /**
   * Retrieve a commit by ID
   */
  const getCommitById = async ({
    commitId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    tx
  }: {
    commitId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    tx?: Knex;
  }) => {
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });
    return folderCommitDAL.findById(commitId, tx, projectId);
  };

  /**
   * Get all commits for a folder
   */
  const getCommitsByFolderId = async (folderId: string, tx?: Knex) => {
    return folderCommitDAL.findByFolderId(folderId, tx);
  };

  const getCommitsForFolder = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    environment,
    path,
    offset = 0,
    limit = 20,
    search,
    sort = "desc"
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    environment: string;
    path: string;
    offset: number;
    limit: number;
    search?: string;
    sort: "asc" | "desc";
  }) => {
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });
    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder not found for project ID ${projectId}, environment ${environment}, path ${path}`
      });
    }
    const folderCommits = await folderCommitDAL.findByFolderIdPaginated(folder.id, {
      offset,
      limit,
      search,
      sort
    });
    return folderCommits;
  };

  const getCommitsCount = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    environment,
    path
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    environment: string;
    path: string;
  }) => {
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) {
      throw new NotFoundError({
        message: `Folder not found for project ID ${projectId}, environment ${environment}, path ${path}`
      });
    }
    const folderCommits = await folderCommitDAL.findByFolderId(folder.id);
    return { count: folderCommits.length, folderId: folder.id };
  };

  /**
   * Get changes for a commit
   */
  const getCommitChanges = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    commitId
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    commitId: string;
  }) => {
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });
    const changes = await folderCommitChangesDAL.findByCommitId(commitId, projectId);
    const commit = await folderCommitDAL.findById(commitId, undefined, projectId);
    const latestCommit = await folderCommitDAL.findLatestCommit(commit.folderId, projectId);
    return { ...commit, changes, isLatest: commit.id === latestCommit?.id };
  };

  /**
   * Get checkpoints for a folder
   */
  const getCheckpointsByFolderId = async (folderId: string, limit?: number, tx?: Knex) => {
    return folderCheckpointDAL.findByFolderId(folderId, limit, tx);
  };

  /**
   * Get the latest checkpoint for a folder
   */
  const getLatestCheckpoint = async (folderId: string, tx?: Knex) => {
    return folderCheckpointDAL.findLatestByFolderId(folderId, tx);
  };

  /**
   * Initialize a folder with its current state
   */
  const getFolderInitialChanges = async (folderId: string, envId: string, tx?: Knex) => {
    const folderResources = await getFolderResources(folderId, tx);
    const changes = folderResources.map((resource) => ({ type: ChangeType.ADD, ...resource }));

    if (changes.length > 0) {
      return {
        commit: {
          actorMetadata: {},
          actorType: ActorType.PLATFORM,
          message: "Initialized folder",
          folderId,
          envId
        },
        changes: changes.map((change) => ({
          folderId,
          changeType: change.type,
          secretVersionId: change.secretVersionId,
          folderVersionId: change.folderVersionId,
          isUpdate: false
        }))
      };
    }
    return {};
  };

  /**
   * Sort folders by hierarchy (parents before children)
   */
  const sortFoldersByHierarchy = (folders: TSecretFolders[]) => {
    // Create a map for quick lookup of children by parent ID
    const childrenMap = new Map<string, TSecretFolders[]>();

    // Set of all folder IDs
    const allFolderIds = new Set<string>();

    // Build the set of all folder IDs
    folders.forEach((folder) => {
      if (folder.id) {
        allFolderIds.add(folder.id);
      }
    });

    // Group folders by their parentId
    folders.forEach((folder) => {
      if (folder.parentId) {
        const children = childrenMap.get(folder.parentId) || [];
        children.push(folder);
        childrenMap.set(folder.parentId, children);
      }
    });

    // Find root folders - those with no parentId or with a parentId that doesn't exist
    const rootFolders = folders.filter((folder) => !folder.parentId || !allFolderIds.has(folder.parentId));

    // Process each level of the hierarchy
    const result = [];
    let currentLevel = rootFolders;

    while (currentLevel.length > 0) {
      result.push(...currentLevel);

      const nextLevel = [];
      for (const folder of currentLevel) {
        if (folder.id) {
          const children = childrenMap.get(folder.id) || [];
          nextLevel.push(...children);
        }
      }

      currentLevel = nextLevel;
    }

    return result;
  };

  /**
   * Create a checkpoint for a folder tree
   */
  const createFolderTreeCheckpoint = async (envId: string, folderCommitId?: string, tx?: Knex) => {
    let latestCommitId = folderCommitId;
    const latestTreeCheckpoint = await folderTreeCheckpointDAL.findLatestByEnvId(envId, tx);

    if (!latestCommitId) {
      const latestCommit = await folderCommitDAL.findLatestEnvCommit(envId, tx);
      if (!latestCommit) {
        logger.info(`createFolderTreeCheckpoint - Latest commit ID not found for envId ${envId}`);
        return;
      }
      latestCommitId = latestCommit.id;
    }

    if (latestTreeCheckpoint) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getEnvNumberOfCommitsSince(
        envId,
        latestTreeCheckpoint.folderCommitId,
        tx
      );
      if (commitsSinceLastCheckpoint < Number(appCfg.PIT_TREE_CHECKPOINT_WINDOW)) {
        logger.info(
          `createFolderTreeCheckpoint - Commits since last checkpoint ${commitsSinceLastCheckpoint} is less than ${appCfg.PIT_TREE_CHECKPOINT_WINDOW}`
        );
        return;
      }
    }

    const folders = await folderDAL.findByEnvId(envId, tx);
    const sortedFolders = sortFoldersByHierarchy(folders);
    const filteredFoldersIds = sortedFolders.filter((folder) => !folder.isReserved).map((folder) => folder.id);
    const folderCommits = await folderCommitDAL.findMultipleLatestCommits(filteredFoldersIds, tx);
    const folderTreeCheckpoint = await folderTreeCheckpointDAL.create(
      {
        folderCommitId: latestCommitId
      },
      tx
    );
    await folderTreeCheckpointResourcesDAL.insertMany(
      folderCommits.map((folderCommit) => ({
        folderTreeCheckpointId: folderTreeCheckpoint.id,
        folderId: folderCommit.folderId,
        folderCommitId: folderCommit.id
      })),
      tx
    );
  };

  const addNestedFolderChanges = async ({
    changes,
    beforeCommit,
    folderId,
    folderName,
    folderPath,
    step = 1,
    tx
  }: {
    changes: {
      folderId: string;
      folderName: string;
      changes: ResourceChange[];
      folderPath?: string;
    }[];
    beforeCommit: bigint;
    folderId: string;
    folderName?: string;
    folderPath?: string;
    step?: number;
    tx?: Knex;
  }) => {
    if (step > 20) {
      return;
    }
    const latestFolderCommit = await folderCommitDAL.findCommitBefore(folderId, beforeCommit, tx);
    if (!latestFolderCommit) {
      return;
    }
    const diff = await compareFolderStates({
      targetCommitId: latestFolderCommit.id,
      tx
    });
    changes.push({
      folderId,
      folderName: folderName || "",
      changes: diff,
      folderPath: folderPath || ""
    });
    await Promise.all(
      diff.map(async (change) => {
        if (change.type === ResourceType.FOLDER && change.changeType === ChangeType.CREATE) {
          await addNestedFolderChanges({
            changes,
            beforeCommit,
            folderId: change.id,
            folderName: change.folderName,
            folderPath: `${folderPath}/${change.folderName}`,
            step: step + 1,
            tx
          });
        }
      })
    );
  };

  const deepCompareFolder = async ({
    targetCommitId,
    envId,
    projectId,
    tx
  }: {
    targetCommitId: string;
    envId: string;
    projectId: string;
    tx?: Knex;
  }) => {
    const targetCommit = await folderCommitDAL.findById(targetCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `No commit found for commit ID ${targetCommitId}` });
    }

    const checkpoint = await folderTreeCheckpointDAL.findNearestCheckpoint(targetCommit.commitId, envId, tx);
    if (!checkpoint) {
      throw new NotFoundError({ message: `No checkpoint found for commit ID ${targetCommitId}` });
    }

    const folderCheckpointCommits = await folderTreeCheckpointResourcesDAL.findByTreeCheckpointId(checkpoint.id, tx);
    const folderCommits = await folderCommitDAL.findAllCommitsBetween({
      envId,
      startCommitId: checkpoint.commitId.toString(),
      tx
    });

    // Group commits by folderId and keep only the latest
    const folderGroups = new Map<string, { commitId: bigint; id: string }>();

    if (folderCheckpointCommits && folderCheckpointCommits.length > 0) {
      for (const commit of folderCheckpointCommits) {
        if (commit.commitId > targetCommit.commitId) {
          folderGroups.set(commit.folderId, {
            commitId: commit.commitId,
            id: commit.folderCommitId
          });
        }
      }
    }

    if (folderCommits && folderCommits.length > 0) {
      for (const commit of folderCommits) {
        const { folderId, commitId, id } = commit;
        const existingCommit = folderGroups.get(folderId);

        if ((!existingCommit || commitId > existingCommit.commitId) && commitId > targetCommit.commitId) {
          folderGroups.set(folderId, { commitId, id });
        }
      }
    }

    const folderDiffs = new Map<string, ResourceChange[]>();

    // Process each folder to determine differences
    await Promise.all(
      Array.from(folderGroups.entries()).map(async ([folderId, commit]) => {
        const previousCommit = await folderCommitDAL.findPreviousCommitTo(
          folderId,
          targetCommit.commitId.toString(),
          tx
        );
        let diff = [];
        if (previousCommit && previousCommit.id !== commit.id) {
          diff = await compareFolderStates({
            currentCommitId: commit.id,
            targetCommitId: previousCommit.id,
            tx
          });
        } else {
          diff = await compareFolderStates({
            targetCommitId: commit.id,
            defaultOperation: "delete",
            tx
          });
        }
        if (diff?.length > 0) {
          folderDiffs.set(folderId, diff);
        }
      })
    );

    // Apply changes in hierarchical order
    const folderIds = Array.from(folderDiffs.keys());
    const folders = await folderDAL.findFoldersByRootAndIds({ rootId: targetCommit.folderId, folderIds }, tx);
    const sortedFolders = sortFoldersByHierarchy(folders);

    const response: {
      folderId: string;
      folderName: string;
      changes: ResourceChange[];
      folderPath?: string;
    }[] = [];
    for (const folder of sortedFolders) {
      const diff = folderDiffs.get(folder.id);
      if (diff) {
        const folderPath = await folderDAL.findSecretPathByFolderIds(projectId, [folder.id]);
        response.push({
          folderId: folder.id,
          folderName: folder.name,
          changes: diff,
          folderPath: folderPath?.[0]?.path
        });
        const recreatedFolders = diff
          .filter(
            (change): change is FolderChange =>
              change.type === ResourceType.FOLDER && change.changeType === ChangeType.CREATE
          )
          .map((change) => ({
            id: change.id,
            folderName: change.folderName,
            folderPath: folderPath?.[0]?.path
          }));
        await Promise.all(
          recreatedFolders.map(async (change) => {
            const nestedFolderPath = folderPath?.[0]?.path;
            await addNestedFolderChanges({
              changes: response,
              beforeCommit: targetCommit.commitId,
              folderId: change.id,
              folderName: change.folderName,
              folderPath: `${nestedFolderPath !== "/" ? nestedFolderPath : ""}/${change.folderName}`,
              tx
            });
          })
        );
      }
    }
    return response;
  };

  /**
   * Roll back a folder tree to a specific commit
   */
  const deepRollbackFolder = async (
    targetCommitId: string,
    envId: string,
    actorId: string,
    actorType: ActorType,
    projectId: string,
    message?: string
  ) => {
    await folderCommitDAL.transaction(async (tx) => {
      const targetCommit = await folderCommitDAL.findById(targetCommitId, tx);
      if (!targetCommit) {
        throw new NotFoundError({ message: `No commit found for commit ID ${targetCommitId}` });
      }

      const checkpoint = await folderTreeCheckpointDAL.findNearestCheckpoint(targetCommit.commitId, envId, tx);
      if (!checkpoint) {
        throw new NotFoundError({ message: `No checkpoint found for commit ID ${targetCommitId}` });
      }

      const folderCheckpointCommits = await folderTreeCheckpointResourcesDAL.findByTreeCheckpointId(checkpoint.id, tx);
      const folderCommits = await folderCommitDAL.findAllCommitsBetween({
        envId,
        startCommitId: checkpoint.commitId.toString(),
        tx
      });

      // Group commits by folderId and keep only the latest
      const folderGroups = new Map<string, { commitId: bigint; id: string }>();

      if (folderCheckpointCommits && folderCheckpointCommits.length > 0) {
        for (const commit of folderCheckpointCommits) {
          if (commit.commitId > targetCommit.commitId) {
            folderGroups.set(commit.folderId, {
              commitId: commit.commitId,
              id: commit.folderCommitId
            });
          }
        }
      }

      if (folderCommits && folderCommits.length > 0) {
        for (const commit of folderCommits) {
          const { folderId, commitId, id } = commit;
          const existingCommit = folderGroups.get(folderId);

          if ((!existingCommit || commitId > existingCommit.commitId) && commitId > targetCommit.commitId) {
            folderGroups.set(folderId, { commitId, id });
          }
        }
      }

      const folderDiffs = new Map<string, ResourceChange[]>();

      // Process each folder to determine differences
      await Promise.all(
        Array.from(folderGroups.entries()).map(async ([folderId, { id }]) => {
          const previousCommit = await folderCommitDAL.findPreviousCommitTo(
            folderId,
            targetCommit.commitId.toString(),
            tx
          );
          if (previousCommit && previousCommit.id !== id) {
            const diff = await compareFolderStates({
              currentCommitId: id,
              targetCommitId: previousCommit.id,
              tx
            });
            if (diff?.length > 0) {
              folderDiffs.set(folderId, diff);
            }
          }
        })
      );

      const foldersToDelete = new Set<string>();

      // Process all DELETE operations to build a complete set of folders to be deleted
      for (const changes of folderDiffs.values()) {
        for (const change of changes) {
          if (change.changeType === ChangeType.DELETE && change.type === ResourceType.FOLDER) {
            foldersToDelete.add(change.id);
          }
        }
      }

      // Now, remove any folder that is being deleted from the folderDiffs map
      // before applying any changes
      for (const folderId of foldersToDelete) {
        folderDiffs.delete(folderId);
      }

      // Apply changes in hierarchical order
      const folderIds = Array.from(folderDiffs.keys());
      const folders = await folderDAL.findFoldersByRootAndIds({ rootId: targetCommit.folderId, folderIds }, tx);
      const sortedFolders = sortFoldersByHierarchy(folders);

      for (const folder of sortedFolders) {
        const diff = folderDiffs.get(folder.id);
        if (diff) {
          await applyFolderStateDifferences({
            differences: diff,
            actorInfo: {
              actorType,
              actorId,
              message: message || "Deep rollback"
            },
            folderId: folder.id,
            projectId,
            reconstructNewFolders: true,
            reconstructUpToCommit: targetCommit.commitId.toString(),
            tx
          });
        }
      }
    });
  };

  const getLatestCommit = async ({
    folderId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId
  }: {
    folderId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
  }) => {
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });
    return folderCommitDAL.findLatestCommit(folderId, projectId);
  };

  /**
   * Revert changes made in a specific commit
   */
  const revertCommitChanges = async ({
    commitId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    message = "Revert commit changes"
  }: {
    commitId: string;
    actor: ActorType;
    actorId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
    projectId: string;
    message?: string;
  }) => {
    if (!permissionService) {
      throw new Error("Permission service not initialized");
    }
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionCommitsActions.PerformRollback,
      ProjectPermissionSub.Commits
    );
    // Check permissions first
    await checkProjectCommitReadPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    });

    // Get the commit to revert
    const commitToRevert = await folderCommitDAL.findById(commitId, undefined, projectId);
    if (!commitToRevert) {
      throw new NotFoundError({ message: `Commit with ID ${commitId} not found` });
    }

    const previousCommit = await folderCommitDAL.findCommitBefore(commitToRevert.folderId, commitToRevert.commitId);

    if (!previousCommit) {
      throw new BadRequestError({ message: "Cannot revert the first commit" });
    }

    // Calculate the changes needed to go from current commit back to the previous one
    const inverseChanges = await compareFolderStates({
      currentCommitId: commitToRevert.id,
      targetCommitId: previousCommit.id
    });

    const latestCommit = await folderCommitDAL.findLatestCommit(commitToRevert.folderId);
    if (!latestCommit) {
      throw new NotFoundError({ message: `Latest commit not found for folder ${commitToRevert.folderId}` });
    }
    const currentState = await reconstructFolderState(latestCommit.id);

    const filteredChanges = inverseChanges.filter(
      (change) =>
        ((change.changeType === ChangeType.DELETE || change.changeType === ChangeType.UPDATE) &&
          (currentState.some((c) => c.id === change.id) || currentState.some((c) => c.id === change.id))) ||
        (change.changeType === ChangeType.CREATE &&
          (currentState.every((c) => c.id !== change.id) || currentState.every((c) => c.id !== change.id)))
    );

    if (!filteredChanges || filteredChanges.length === 0) {
      return {
        success: true,
        message: "No changes to revert",
        originalCommitId: commitId
      };
    }

    // Apply the changes to revert the commit
    const revertResult = await applyFolderStateDifferences({
      differences: filteredChanges,
      actorInfo: {
        actorType: actor,
        actorId,
        message: message || `Reverted changes from commit ${commitId}`
      },
      folderId: commitToRevert.folderId,
      projectId,
      reconstructNewFolders: true,
      reconstructUpToCommit: commitToRevert.commitId.toString()
    });

    return {
      success: true,
      message: "Changes reverted successfully",
      originalCommitId: commitId,
      revertCommitId: latestCommit?.id,
      changesReverted: revertResult.totalChanges
    };
  };

  return {
    createCommit,
    addCommitChange,
    getCommitById,
    getCommitsByFolderId,
    getCommitChanges,
    getCheckpointsByFolderId,
    getLatestCheckpoint,
    getFolderInitialChanges,
    createFolderCheckpoint,
    compareFolderStates,
    applyFolderStateDifferences,
    createFolderTreeCheckpoint,
    deepRollbackFolder,
    getCommitsCount,
    getLatestCommit,
    deepCompareFolder,
    reconstructFolderState,
    getCommitsForFolder,
    revertCommitChanges
  };
};

export type TFolderCommitServiceFactory = ReturnType<typeof folderCommitServiceFactory>;
