/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";
import path from "path";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";

import { ActionProjectType, TProjectEnvironments, TSecretFolders, TSecretFoldersInsert } from "@app/db/schemas";
import { TDynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { THoneyTokenDALFactory } from "@app/ee/services/honey-token/honey-token-dal";
import { validateSecretMovePermissions } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "@app/ee/services/secret-approval-request/secret-approval-request-secret-dal";
import { TSecretRotationV2DALFactory } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-dal";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { SecretsOrderBy } from "@app/services/secret/secret-types";
import {
  assertFolderMoveAllowed,
  buildFolderPath,
  canActorReadBlock,
  checkFolderMoveBlock,
  checkFolderMovePolicyBlock,
  TFolderMoveAccessScope
} from "@app/services/secret-folder/secret-folder-fns";

import {
  ChangeType,
  CommitType,
  TCommitResourceChangeDTO,
  TFolderCommitServiceFactory
} from "../folder-commit/folder-commit-service";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TReminderDALFactory } from "../reminder/reminder-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TResourceMetadataDALFactory } from "../resource-metadata/resource-metadata-dal";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretTagDALFactory } from "../secret-tag/secret-tag-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { fnSecretMoveInTransaction } from "../secret-v2-bridge/secret-v2-bridge-fns";
import { TSecretV2BridgeServiceFactory } from "../secret-v2-bridge/secret-v2-bridge-service";
import { TFnSecretMoveResult } from "../secret-v2-bridge/secret-v2-bridge-types";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TSecretVersionV2TagDALFactory } from "../secret-v2-bridge/secret-version-tag-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TCreateManyFoldersDTO,
  TDeleteFolderDTO,
  TDeleteManyFoldersDTO,
  TFolderMoveEligibility,
  TGetFolderByIdDTO,
  TGetFolderByPathDTO,
  TGetFolderDTO,
  TGetFolderMoveEligibilityDTO,
  TGetFoldersDeepByEnvsDTO,
  TMoveFolderDTO,
  TMoveFolderResult,
  TUpdateFolderDTO,
  TUpdateManyFoldersDTO
} from "./secret-folder-types";
import { TSecretFolderVersionDALFactory } from "./secret-folder-version-dal";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "findBySlugs" | "find">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestFolderVersions" | "create" | "insertMany" | "find">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  secretApprovalPolicyService: Pick<
    TSecretApprovalPolicyServiceFactory,
    "getSecretApprovalPolicy" | "getSecretApprovalPolicyByPaths"
  >;
  secretV2BridgeDAL: Pick<
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
    | "findByFolderIds"
    | "invalidateSecretCacheByProjectId"
  >;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  secretVersionDAL: Pick<TSecretVersionV2DALFactory, "insertMany" | "findLatestVersionMany">;
  secretTagDAL: Pick<TSecretTagDALFactory, "saveTagsToSecretV2" | "deleteTagsToSecretV2" | "find">;
  secretVersionTagDAL: Pick<TSecretVersionV2TagDALFactory, "insertMany">;
  resourceMetadataDAL: Pick<TResourceMetadataDALFactory, "insertMany" | "delete">;
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertV2Bridge" | "insertApprovalSecretV2Tags"
  >;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findOne" | "find">;
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "existsByFolderIds">;
  honeyTokenDAL: Pick<THoneyTokenDALFactory, "find">;
  secretImportDAL: Pick<TSecretImportDALFactory, "findImportByFolderIds">;
  secretV2BridgeService: Pick<TSecretV2BridgeServiceFactory, "dispatchSecretMoveSideEffects">;
  reminderDAL: Pick<TReminderDALFactory, "findSecretReminders" | "delete">;
  reminderService: Pick<TReminderServiceFactory, "batchCreateReminders">;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDAL,
  permissionService,
  projectEnvDAL,
  folderVersionDAL,
  folderCommitService,
  projectDAL,
  secretApprovalPolicyService,
  secretV2BridgeDAL,
  kmsService,
  secretVersionDAL,
  secretTagDAL,
  secretVersionTagDAL,
  resourceMetadataDAL,
  secretApprovalRequestDAL,
  secretApprovalRequestSecretDAL,
  secretQueueService,
  dynamicSecretDAL,
  secretRotationV2DAL,
  honeyTokenDAL,
  secretImportDAL,
  secretV2BridgeService,
  reminderDAL,
  reminderService
}: TSecretFolderServiceFactoryDep) => {
  const createFolder = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    name,
    environment,
    path: secretPath,
    description
  }: TCreateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
    );

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) {
      throw new NotFoundError({
        message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
      });
    }

    const folder = await folderDAL.transaction(async (tx) => {
      // the logic is simple we need to avoid creating same folder in same path multiple times
      // that is this request must be idempotent
      // so we do a tricky move. we try to find the to be created folder path if that is exactly match return that
      // else we get some path before that then we will start creating remaining folder
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateFolder(env.id, env.projectId)]);

      const pathWithFolder = path.join(secretPath, name);
      const parentFolder = await folderDAL.findClosestFolder(projectId, environment, pathWithFolder, tx);

      if (!parentFolder) {
        throw new NotFoundError({
          message: `Parent folder for path '${pathWithFolder}' not found`
        });
      }

      // exact folder case
      if (parentFolder.path === pathWithFolder) {
        throw new BadRequestError({
          message: `Folder with name '${name}' already exists in path '${secretPath}'`
        });
      }

      let currentParentId = parentFolder.id;

      // build the full path we need by processing each segment
      if (parentFolder.path !== secretPath) {
        const missingSegments = secretPath.substring(parentFolder.path.length).split("/").filter(Boolean);

        const newFolders: TSecretFoldersInsert[] = [];

        // process each segment sequentially
        for await (const segment of missingSegments) {
          const existingSegment = await folderDAL.findOne(
            {
              name: segment,
              parentId: currentParentId,
              envId: env.id,
              isReserved: false
            },
            tx
          );

          if (existingSegment) {
            // use existing folder and update the path / parent
            currentParentId = existingSegment.id;
          } else {
            const newFolder = {
              name: segment,
              parentId: currentParentId,
              id: uuidv4(),
              envId: env.id,
              version: 1
            };

            currentParentId = newFolder.id;
            newFolders.push(newFolder);
          }
        }

        if (newFolders.length) {
          const docs = await folderDAL.insertMany(newFolders, tx);
          const folderVersions = await folderVersionDAL.insertMany(
            docs.map((doc) => ({
              name: doc.name,
              envId: doc.envId,
              version: doc.version,
              folderId: doc.id,
              description: doc.description
            })),
            tx
          );
          await folderCommitService.createCommit(
            {
              actor: {
                type: actor,
                metadata: {
                  id: actorId
                }
              },
              message: "Folder created",
              folderId: currentParentId,
              changes: folderVersions.map((fv) => ({
                type: CommitType.ADD,
                folderVersionId: fv.id
              }))
            },
            tx
          );
        }
      }

      const doc = await folderDAL.create(
        { name, envId: env.id, version: 1, parentId: currentParentId, description },
        tx
      );

      const folderVersion = await folderVersionDAL.create(
        {
          name: doc.name,
          envId: doc.envId,
          version: doc.version,
          folderId: doc.id,
          description: doc.description
        },
        tx
      );

      await folderCommitService.createCommit(
        {
          actor: {
            type: actor,
            metadata: {
              id: actorId
            }
          },
          message: "Folder created",
          folderId: parentFolder.id,
          changes: [
            {
              type: CommitType.ADD,
              folderVersionId: folderVersion.id
            }
          ]
        },
        tx
      );

      const [folderWithFullPath] = await folderDAL.findSecretPathByFolderIds(projectId, [doc.id], tx);

      if (!folderWithFullPath) {
        throw new NotFoundError({
          message: `Failed to retrieve path for folder with ID '${doc.id}'`
        });
      }

      return { ...doc, path: folderWithFullPath.path };
    });

    return folder;
  };

  const updateManyFolders = async ({
    actor,
    actorId,
    projectSlug,
    projectId: providedProjectId,
    actorAuthMethod,
    actorOrgId,
    folders,
    tx: providedTx,
    commitChanges
  }: TUpdateManyFoldersDTO & { tx?: Knex; commitChanges?: TCommitResourceChangeDTO[]; projectId?: string }) => {
    let projectId = providedProjectId;
    if (!projectId && projectSlug) {
      const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
      if (!project) {
        throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
      }
      projectId = project.id;
    }
    if (!projectId) {
      throw new BadRequestError({ message: "Must provide either project slug or projectId" });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    folders.forEach(({ environment, path: secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    });

    const executeBulkUpdate = async (tx: Knex) => {
      return Promise.all(
        folders.map(async (newFolder) => {
          const { environment, path: secretPath, id, name, description } = newFolder;

          const parentFolder = await folderDAL.findBySecretPath(projectId as string, environment, secretPath, tx);
          if (!parentFolder) {
            throw new NotFoundError({
              message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
              name: "UpdateManyFolders"
            });
          }

          const env = await projectEnvDAL.findOne({ projectId, slug: environment }, tx);
          if (!env) {
            throw new NotFoundError({
              message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`,
              name: "UpdateManyFolders"
            });
          }
          const folder = await folderDAL
            .findOne({ envId: env.id, id, parentId: parentFolder.id })
            // now folder api accepts id based change
            // this is for cli backward compatiability and when cli removes this, we will remove this logic
            .catch(() => folderDAL.findOne({ envId: env.id, name: id, parentId: parentFolder.id }));

          if (!folder) {
            throw new NotFoundError({
              message: `Folder with id '${id}' in environment with slug '${env.slug}' not found`,
              name: "UpdateManyFolders"
            });
          }
          if (name !== folder.name) {
            // ensure that new folder name is unique
            const folderToCheck = await folderDAL.findOne({
              name,
              envId: env.id,
              parentId: parentFolder.id
            });

            if (folderToCheck) {
              throw new BadRequestError({
                message: "Folder with specified name already exists",
                name: "Batch update folder"
              });
            }
          }

          const [doc] = await folderDAL.update(
            { envId: env.id, id: folder.id, parentId: parentFolder.id },
            { name, description },
            tx
          );
          const folderVersion = await folderVersionDAL.create(
            {
              name: doc.name,
              envId: doc.envId,
              version: doc.version,
              folderId: doc.id,
              description: doc.description
            },
            tx
          );
          if (commitChanges) {
            commitChanges.push({
              type: CommitType.ADD,
              isUpdate: true,
              folderVersionId: folderVersion.id
            });
          } else {
            await folderCommitService.createCommit(
              {
                actor: {
                  type: actor,
                  metadata: {
                    id: actorId
                  }
                },
                message: "Folder updated",
                folderId: parentFolder.id,
                changes: [
                  {
                    type: CommitType.ADD,
                    isUpdate: true,
                    folderVersionId: folderVersion.id
                  }
                ]
              },
              tx
            );
          }
          if (!doc) {
            throw new NotFoundError({
              message: `Failed to update folder with id '${id}', not found`,
              name: "UpdateManyFolders"
            });
          }

          return { oldFolder: folder, newFolder: doc };
        })
      );
    };

    // Execute with provided transaction or create new one
    const result = providedTx ? await executeBulkUpdate(providedTx) : await folderDAL.transaction(executeBulkUpdate);

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return {
      projectId,
      newFolders: result.map((res) => res.newFolder),
      oldFolders: result.map((res) => res.oldFolder)
    };
  };

  const updateFolder = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    environment,
    path: secretPath,
    id,
    description
  }: TUpdateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
    );

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder)
      throw new NotFoundError({
        message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
        name: "UpdateFolder"
      });

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) {
      throw new NotFoundError({ message: `Environment with slug '${environment}' not found`, name: "UpdateFolder" });
    }
    const folder = await folderDAL
      .findOne({ envId: env.id, id, parentId: parentFolder.id, isReserved: false })
      // now folder api accepts id based change
      // this is for cli backward compatiability and when cli removes this, we will remove this logic
      .catch(() => folderDAL.findOne({ envId: env.id, name: id, parentId: parentFolder.id }));

    if (!folder) throw new NotFoundError({ message: `Folder with ID '${id}' not found`, name: "UpdateFolder" });
    if (name !== folder.name) {
      // ensure that new folder name is unique
      const folderToCheck = await folderDAL.findOne({
        name,
        envId: env.id,
        parentId: parentFolder.id
      });

      if (folderToCheck) {
        throw new BadRequestError({
          message: "Folder with specified name already exists",
          name: "UpdateFolder"
        });
      }
    }

    const { newFolder, newFolderPath, oldFolderPath } = await folderDAL.transaction(async (tx) => {
      // Read the old folder path BEFORE the update to capture the original name in the path.
      // This must be done inside the transaction to ensure read-after-write consistency
      // when using read replicas, but before the UPDATE to get the old state.
      const [oldFolderWithPath] = await folderDAL.findSecretPathByFolderIds(projectId, [folder.id], tx);
      if (!oldFolderWithPath) {
        throw new NotFoundError({
          message: `Failed to retrieve path for folder with ID '${folder.id}'`
        });
      }

      const [doc] = await folderDAL.update(
        { envId: env.id, id: folder.id, parentId: parentFolder.id, isReserved: false },
        { name, description },
        tx
      );
      const folderVersion = await folderVersionDAL.create(
        {
          name: doc.name,
          envId: doc.envId,
          version: doc.version,
          folderId: doc.id,
          description: doc.description
        },
        tx
      );
      await folderCommitService.createCommit(
        {
          actor: {
            type: actor,
            metadata: {
              id: actorId
            }
          },
          message: "Folder updated",
          folderId: parentFolder.id,
          changes: [
            {
              type: CommitType.ADD,
              isUpdate: true,
              folderVersionId: folderVersion.id
            }
          ]
        },
        tx
      );
      if (!doc) throw new NotFoundError({ message: `Failed to update folder with ID '${id}'`, name: "UpdateFolder" });

      // Read the new folder path AFTER the update to get the updated name in the path.
      const [newFolderWithPath] = await folderDAL.findSecretPathByFolderIds(projectId, [doc.id], tx);
      if (!newFolderWithPath) {
        throw new NotFoundError({
          message: `Failed to retrieve path for folder with ID '${doc.id}'`
        });
      }

      return { newFolder: doc, newFolderPath: newFolderWithPath.path, oldFolderPath: oldFolderWithPath.path };
    });

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return {
      folder: { ...newFolder, path: newFolderPath },
      old: { ...folder, path: oldFolderPath }
    };
  };

  const $checkFolderPolicy = async ({
    projectId,
    env,
    parentId,
    idOrName,
    actor
  }: {
    projectId: string;
    env: TProjectEnvironments;
    parentId: string;
    idOrName: string;
    actor: ActorType;
  }) => {
    if (actor === ActorType.IDENTITY) {
      return;
    }

    let targetFolder = await folderDAL
      .findOne({
        envId: env.id,
        name: idOrName,
        parentId,
        isReserved: false
      })
      .catch(() => null);

    if (!targetFolder && uuidValidate(idOrName)) {
      targetFolder = await folderDAL
        .findOne({
          envId: env.id,
          id: idOrName,
          parentId,
          isReserved: false
        })
        .catch(() => null);
    }

    if (!targetFolder) {
      throw new NotFoundError({ message: `Target folder not found` });
    }

    // get environment root folder (as it's needed to get all folders under it)
    const rootFolder = await folderDAL.findBySecretPath(projectId, env.slug, "/");
    if (!rootFolder) throw new NotFoundError({ message: `Root folder not found` });
    // get all folders under environment root folder
    const folderPaths = await folderDAL.findByEnvsDeep({ parentIds: [rootFolder.id] });

    // create a map of folders by parent id
    const normalizeKey = (key: string | null | undefined): string => key ?? "root";
    const folderMap = new Map<string, (TSecretFolders & { path: string; depth: number; environment: string })[]>();
    for (const folder of folderPaths) {
      if (!folderMap.has(normalizeKey(folder.parentId))) {
        folderMap.set(normalizeKey(folder.parentId), []);
      }
      folderMap.get(normalizeKey(folder.parentId))?.push(folder);
    }

    // Find the target folder in the folderPaths to get its full details
    const targetFolderWithPath = folderPaths.find((f) => f.id === targetFolder!.id);
    if (!targetFolderWithPath) {
      throw new NotFoundError({ message: `Target folder path not found` });
    }

    // Recursively collect all folders under the target folder (descendants only)
    const collectDescendants = (
      id: string
    ): (TSecretFolders & { path: string; depth: number; environment: string })[] => {
      const children = folderMap.get(normalizeKey(id)) || [];
      return [...children, ...children.flatMap((child) => collectDescendants(child.id))];
    };

    const targetFolderDescendants = collectDescendants(targetFolder.id);

    // Include the target folder itself plus all its descendants
    const foldersToCheck = [targetFolderWithPath, ...targetFolderDescendants];

    const folderPolicyPaths = foldersToCheck.map((folder) => ({
      path: folder.path,
      id: folder.id
    }));

    // get secrets under the given folders
    const secrets = await secretV2BridgeDAL.findByFolderIds({
      folderIds: folderPolicyPaths.map((p) => p.id)
    });

    for await (const folderPolicyPath of folderPolicyPaths) {
      // eslint-disable-next-line no-continue
      if (!secrets.some((s) => s.folderId === folderPolicyPath.id)) continue;

      const policy = await secretApprovalPolicyService.getSecretApprovalPolicy(
        projectId,
        env.slug,
        folderPolicyPath.path
      );

      // if there is a policy and there are secrets under the given folder, throw error
      if (policy) {
        throw new BadRequestError({
          message: `You cannot delete the selected folder because it contains one or more secrets that are protected by the change policy "${policy.name}" at folder path "${folderPolicyPath.path}". Please remove the secrets at folder path "${folderPolicyPath.path}" and try again.`,
          name: "DeleteFolderProtectedByPolicy"
        });
      }
    }
  };

  const deleteFolder = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    path: secretPath,
    idOrName,
    forceDelete = false
  }: TDeleteFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
    );

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: `Environment with slug '${environment}' not found` });

    const folder = await folderDAL.transaction(async (tx) => {
      const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, tx);
      if (!parentFolder)
        throw new NotFoundError({
          message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
        });

      await $checkFolderPolicy({ projectId, env, parentId: parentFolder.id, idOrName, actor });

      let folderToDelete = await folderDAL
        .findOne({
          envId: env.id,
          name: idOrName,
          parentId: parentFolder.id,
          isReserved: false
        })
        .catch(() => null);

      if (!folderToDelete && uuidValidate(idOrName)) {
        folderToDelete = await folderDAL
          .findOne({
            envId: env.id,
            id: idOrName,
            parentId: parentFolder.id,
            isReserved: false
          })
          .catch(() => null);
      }

      if (!folderToDelete) {
        throw new NotFoundError({ message: `Folder with ID '${idOrName}' not found` });
      }

      // Check if folder contains resources (secrets, dynamic secrets, subfolders)
      if (!forceDelete) {
        const error = new BadRequestError({
          message: `Cannot delete folder "${folderToDelete.name}" because it contains resources. Use forceDelete=true to delete it forcefully.`,
          name: "deleteFolder"
        });
        const secretV2 = await secretV2BridgeDAL.findOne({ folderId: folderToDelete.id }).catch(() => null);
        if (secretV2) throw error;

        const dynamicSecret = await dynamicSecretDAL.findOne({ folderId: folderToDelete.id }).catch(() => null);
        if (dynamicSecret) throw error;

        const subfolder = await folderDAL.findOne({ parentId: folderToDelete.id }).catch(() => null);
        if (subfolder) throw error;
      }

      const [doc] = await folderDAL.delete(
        {
          envId: env.id,
          id: folderToDelete.id,
          parentId: parentFolder.id,
          isReserved: false
        },
        tx
      );

      const folderVersions = await folderVersionDAL.findLatestFolderVersions([doc.id], tx);

      await folderCommitService.createCommit(
        {
          actor: {
            type: actor,
            metadata: {
              id: actorId
            }
          },
          message: "Folder deleted",
          folderId: parentFolder.id,
          changes: [
            {
              type: CommitType.DELETE,
              folderVersionId: folderVersions[doc.id].id,
              folderId: doc.id
            }
          ]
        },
        tx
      );
      return doc;
    });

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return folder;
  };

  const getFolders = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    path: secretPath,
    search,
    orderBy,
    orderDirection,
    limit,
    offset,
    recursive,
    lastSecretModified
  }: TGetFolderDTO) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: `Environment with slug '${environment}' not found` });

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder) return [];

    if (recursive) {
      const recursiveFolders = await folderDAL.findByEnvsDeep({
        parentIds: [parentFolder.id],
        orderBy: orderBy || SecretsOrderBy.Name,
        orderDirection: orderDirection || OrderByDirection.ASC
      });
      // remove the parent folder
      return recursiveFolders
        .filter((folder) => {
          if (lastSecretModified) {
            if (!folder.lastSecretModified) return false;

            if (folder.lastSecretModified < new Date(lastSecretModified)) {
              return false;
            }
          }
          return folder.id !== parentFolder.id;
        })
        .map((folder) => ({
          ...folder,
          relativePath: folder.path
        }));
    }

    const folders = await folderDAL.findByMultiEnv({
      environmentIds: [env.id],
      parentIds: [parentFolder.id],
      search,
      orderBy: orderBy || SecretsOrderBy.Name,
      orderDirection: orderDirection || OrderByDirection.ASC,
      limit,
      offset
    });
    if (lastSecretModified) {
      return folders.filter((el) =>
        el.lastSecretModified ? el.lastSecretModified >= new Date(lastSecretModified) : false
      );
    }
    return folders;
  };

  // get folders for multiple envs
  const getFoldersMultiEnv = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environments,
    path: secretPath,
    ...params
  }: Omit<TGetFolderDTO, "environment"> & { environments: string[] }) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const envs = await projectEnvDAL.findBySlugs(projectId, environments);

    if (!envs.length)
      throw new NotFoundError({
        message: `Environments '${environments.join(", ")}' not found`,
        name: "GetFoldersMultiEnv"
      });

    const parentFolders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!parentFolders.length) return [];

    const folders = await folderDAL.findByMultiEnv({
      environmentIds: envs.map((env) => env.id),
      parentIds: parentFolders.map((folder) => folder.id),
      ...params
    });

    return folders;
  };

  // get the unique count of folders within a project path
  const getProjectFolderCount = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environments,
    path: secretPath,
    search
  }: Omit<TGetFolderDTO, "environment"> & { environments: string[] }) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const envs = await projectEnvDAL.findBySlugs(projectId, environments);

    if (!envs.length) throw new NotFoundError({ message: `Environments '${environments.join(", ")}' not found` });

    const parentFolders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!parentFolders.length) return 0;

    const folders = await folderDAL.find(
      {
        $in: {
          envId: envs.map((env) => env.id),
          parentId: parentFolders.map((folder) => folder.id)
        },
        isReserved: false,
        $search: search ? { name: search } : undefined
      },
      { countDistinct: "name" }
    );

    return Number(folders[0]?.count ?? 0);
  };

  const getFolderById = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TGetFolderByIdDTO) => {
    const folder = await folderDAL.findById(id);
    if (!folder) throw new NotFoundError({ message: `Folder with ID '${id}' not found` });
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: folder.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);

    if (!folderWithPath) {
      throw new NotFoundError({
        message: `Folder with ID '${folder.id}' in project with ID '${folder.projectId}' not found`
      });
    }

    return {
      ...folder,
      path: folderWithPath.path
    };
  };

  const getFoldersDeepByEnvs = async (
    { projectId, environments, secretPath }: TGetFoldersDeepByEnvsDTO,
    actor: OrgServiceActor
  ) => {
    // folder list is allowed to be read by anyone
    // permission to check does user have access
    await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const envs = await projectEnvDAL.findBySlugs(projectId, environments);

    if (!envs.length)
      throw new NotFoundError({
        message: `Environments '${environments.join(", ")}' not found`,
        name: "GetFoldersDeep"
      });

    const parentFolders = await folderDAL.findBySecretPathMultiEnv(projectId, environments, secretPath);
    if (!parentFolders.length) return [];

    const folders = await folderDAL.findByEnvsDeep({ parentIds: parentFolders.map((parent) => parent.id) });

    return folders;
  };

  const getProjectEnvironmentsFolders = async (projectId: string, actor: OrgServiceActor) => {
    // folder list is allowed to be read by anyone
    // permission is to check if user has access
    await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const environments = await projectEnvDAL.find({ projectId });

    const folders = await folderDAL.find({
      $in: {
        envId: environments.map((env) => env.id)
      },
      isReserved: false
    });

    const environmentFolders = Object.fromEntries(
      environments.map((env) => {
        const relevantFolders = folders.filter((folder) => folder.envId === env.id);
        const foldersMap = Object.fromEntries(relevantFolders.map((folder) => [folder.id, folder]));

        const foldersWithPath = relevantFolders
          .map((folder) => {
            try {
              return {
                ...folder,
                path: buildFolderPath(folder, foldersMap)
              };
            } catch (error) {
              return null;
            }
          })
          .filter(Boolean) as {
          path: string;
          id: string;
          createdAt: Date;
          updatedAt: Date;
          name: string;
          envId: string;
          version?: number | null | undefined;
          parentId?: string | null | undefined;
          isReserved?: boolean | undefined;
          description?: string | undefined;
        }[];

        return [env.slug, { ...env, folders: foldersWithPath }];
      })
    );

    return environmentFolders;
  };

  const getFolderVersionsByIds = async ({
    folderId,
    folderVersions
  }: {
    folderId: string;
    folderVersions: string[];
  }) => {
    const versions = await folderVersionDAL.find({
      folderId,
      $in: {
        version: folderVersions.map((v) => Number.parseInt(v, 10))
      }
    });
    return versions;
  };

  const getFolderVersions = async (
    change: {
      folderVersion?: string;
      isUpdate?: boolean;
      changeType?: string;
    },
    fromVersion: string,
    folderId: string
  ) => {
    const currentVersion = change.folderVersion || "1";
    // eslint-disable-next-line no-await-in-loop
    const versions = await getFolderVersionsByIds({
      folderId,
      folderVersions:
        change.isUpdate || change.changeType === ChangeType.UPDATE ? [currentVersion, fromVersion] : [currentVersion]
    });
    return versions.map((v) => ({
      version: v.version?.toString() || "1",
      name: v.name,
      description: v.description
    }));
  };

  const createManyFolders = async ({
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    folders,
    tx: providedTx,
    commitChanges
  }: TCreateManyFoldersDTO & { tx?: Knex; commitChanges?: TCommitResourceChangeDTO[] }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    folders.forEach(({ environment, path: secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    });

    const foldersByEnv = folders.reduce(
      (acc, folder) => {
        if (!acc[folder.environment]) {
          acc[folder.environment] = [];
        }
        acc[folder.environment].push(folder);
        return acc;
      },
      {} as Record<string, typeof folders>
    );

    const executeBulkCreate = async (tx: Knex) => {
      const createdFolders = [];

      for (const [environment, envFolders] of Object.entries(foldersByEnv)) {
        const env = await projectEnvDAL.findOne({ projectId, slug: environment });
        if (!env) {
          throw new NotFoundError({
            message: `Environment with slug '${environment}' in project with ID '${projectId}' not found`
          });
        }

        await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.CreateFolder(env.id, env.projectId)]);

        for (const folderSpec of envFolders) {
          const { name, path: secretPath, description } = folderSpec;

          const pathWithFolder = path.join(secretPath, name);
          const parentFolder = await folderDAL.findClosestFolder(projectId, environment, pathWithFolder, tx);

          if (!parentFolder) {
            throw new NotFoundError({
              message: `Parent folder for path '${pathWithFolder}' not found`
            });
          }

          // Check if the exact folder already exists
          const existingFolder = await folderDAL.findOne(
            {
              envId: env.id,
              parentId: parentFolder.id,
              name,
              isReserved: false
            },
            tx
          );

          if (existingFolder) {
            createdFolders.push(existingFolder);
            // eslint-disable-next-line no-continue
            continue;
          }

          // Handle exact folder case
          if (parentFolder.path === pathWithFolder) {
            createdFolders.push(parentFolder);
            // eslint-disable-next-line no-continue
            continue;
          }

          let currentParentId = parentFolder.id;

          // Build the full path we need by processing each segment
          if (parentFolder.path !== secretPath) {
            const missingSegments = secretPath.substring(parentFolder.path.length).split("/").filter(Boolean);
            const newFolders: TSecretFoldersInsert[] = [];

            for (const segment of missingSegments) {
              const existingSegment = await folderDAL.findOne(
                {
                  name: segment,
                  parentId: currentParentId,
                  envId: env.id,
                  isReserved: false
                },
                tx
              );

              if (existingSegment) {
                currentParentId = existingSegment.id;
              } else {
                const newFolder = {
                  name: segment,
                  parentId: currentParentId,
                  id: uuidv4(),
                  envId: env.id,
                  version: 1
                };

                currentParentId = newFolder.id;
                newFolders.push(newFolder);
              }
            }

            if (newFolders.length) {
              const docs = await folderDAL.insertMany(newFolders, tx);
              const folderVersions = await folderVersionDAL.insertMany(
                docs.map((doc) => ({
                  name: doc.name,
                  envId: doc.envId,
                  version: doc.version,
                  folderId: doc.id,
                  description: doc.description
                })),
                tx
              );
              await folderCommitService.createCommit(
                {
                  actor: {
                    type: actor,
                    metadata: {
                      id: actorId
                    }
                  },
                  message: "Folders created (batch)",
                  folderId: currentParentId,
                  changes: folderVersions.map((fv) => ({
                    type: CommitType.ADD,
                    folderVersionId: fv.id
                  }))
                },
                tx
              );
            }
          }

          // Create the target folder
          const doc = await folderDAL.create(
            { name, envId: env.id, version: 1, parentId: currentParentId, description },
            tx
          );

          const folderVersion = await folderVersionDAL.create(
            {
              name: doc.name,
              envId: doc.envId,
              version: doc.version,
              folderId: doc.id,
              description: doc.description
            },
            tx
          );

          if (commitChanges) {
            commitChanges.push({
              type: CommitType.ADD,
              folderVersionId: folderVersion.id
            });
          } else {
            await folderCommitService.createCommit(
              {
                actor: {
                  type: actor,
                  metadata: {
                    id: actorId
                  }
                },
                message: "Folder created (batch)",
                folderId: doc.id,
                changes: [
                  {
                    type: CommitType.ADD,
                    folderVersionId: folderVersion.id
                  }
                ]
              },
              tx
            );
          }

          createdFolders.push(doc);
        }
      }

      return createdFolders;
    };
    const result = providedTx ? await executeBulkCreate(providedTx) : await folderDAL.transaction(executeBulkCreate);

    return {
      folders: result,
      count: result.length
    };
  };

  const deleteManyFolders = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    folders,
    tx: providedTx,
    commitChanges
  }: TDeleteManyFoldersDTO & { tx?: Knex; commitChanges?: TCommitResourceChangeDTO[] }) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    folders.forEach(({ environment, path: secretPath }) => {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    });

    const foldersByEnv = folders.reduce(
      (acc, folder) => {
        if (!acc[folder.environment]) {
          acc[folder.environment] = [];
        }
        acc[folder.environment].push(folder);
        return acc;
      },
      {} as Record<string, typeof folders>
    );

    const executeBulkDelete = async (tx: Knex) => {
      const deletedFolders = [];

      for (const [environment, envFolders] of Object.entries(foldersByEnv)) {
        const env = await projectEnvDAL.findOne({ projectId, slug: environment });
        if (!env) {
          throw new NotFoundError({
            message: `Environment with slug '${environment}' not found`
          });
        }

        for (const folderSpec of envFolders) {
          const { path: secretPath, idOrName } = folderSpec;

          const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, tx);
          if (!parentFolder) {
            throw new NotFoundError({
              message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`
            });
          }

          await $checkFolderPolicy({ projectId, env, parentId: parentFolder.id, idOrName, actor });

          let folderToDelete = await folderDAL
            .findOne({
              envId: env.id,
              name: idOrName,
              parentId: parentFolder.id,
              isReserved: false
            })
            .catch(() => null);

          if (!folderToDelete && uuidValidate(idOrName)) {
            folderToDelete = await folderDAL
              .findOne({
                envId: env.id,
                id: idOrName,
                parentId: parentFolder.id,
                isReserved: false
              })
              .catch(() => null);
          }

          if (!folderToDelete) {
            throw new NotFoundError({
              message: `Folder with ID/name '${idOrName}' not found`
            });
          }

          const [doc] = await folderDAL.delete(
            {
              envId: env.id,
              id: folderToDelete.id,
              parentId: parentFolder.id,
              isReserved: false
            },
            tx
          );

          const folderVersions = await folderVersionDAL.findLatestFolderVersions([doc.id], tx);

          if (commitChanges) {
            commitChanges.push({
              type: CommitType.DELETE,
              folderVersionId: folderVersions[doc.id].id,
              folderId: doc.id
            });
          } else {
            await folderCommitService.createCommit(
              {
                actor: {
                  type: actor,
                  metadata: {
                    id: actorId
                  }
                },
                message: "Folder deleted (batch)",
                folderId: parentFolder.id,
                changes: [
                  {
                    type: CommitType.DELETE,
                    folderVersionId: folderVersions[doc.id].id,
                    folderId: doc.id
                  }
                ]
              },
              tx
            );
          }

          deletedFolders.push(doc);
        }
      }

      return deletedFolders;
    };

    const result = providedTx ? await executeBulkDelete(providedTx) : await folderDAL.transaction(executeBulkDelete);

    return {
      folders: result,
      count: result.length
    };
  };

  const getFolderByPath = async (
    { projectId, environment, secretPath }: TGetFolderByPathDTO,
    actor: OrgServiceActor
  ) => {
    // folder check is allowed to be read by anyone
    // permission is to check if user has access
    await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      projectId,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new NotFoundError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    return folder;
  };

  // dependencies shared by the folder-move block scan in both the eligibility check and the move itself.
  const folderMoveBlockDeps = {
    secretImportDAL,
    dynamicSecretDAL,
    honeyTokenDAL,
    secretRotationV2DAL,
    secretApprovalPolicyService
  };

  // computes the reasons a folder subtree cannot be moved, shared by the read-only eligibility check and the
  // actual move. it scans the source subtree for non-static-secret resources and for source paths governed by a
  // secret approval policy (combined into `sourceBlock`), and — when a destination is provided — also checks the
  // destination paths for a governing policy (`destinationBlock`); a folder cannot be moved INTO a path governed
  // by a policy since the move would create its secrets there, bypassing the approval the policy requires. pass
  // `accessScope` to limit reporting to paths the actor may read; omit it (the move path) to always detect a block
  // and gate only the resulting message.
  const $getFolderMoveBlocks = async (
    {
      subtree,
      projectId,
      sourceEnvironment,
      sourceFolderPath,
      destination,
      accessScope
    }: {
      subtree: { id: string; path: string }[];
      projectId: string;
      sourceEnvironment: string;
      sourceFolderPath: string;
      destination?: { environment: string; path: string };
      accessScope?: TFolderMoveAccessScope;
    },
    tx: Knex
  ) => {
    const secretTypeBlock = await checkFolderMoveBlock(
      { subtree, rootFolderPath: sourceFolderPath, accessScope },
      folderMoveBlockDeps,
      tx
    );
    const sourcePolicyBlock = await checkFolderMovePolicyBlock(
      { subtree, projectId, environment: sourceEnvironment, rootFolderPath: sourceFolderPath, accessScope },
      folderMoveBlockDeps
    );
    const sourceBlock = secretTypeBlock ?? sourcePolicyBlock;

    const destinationBlock = destination
      ? await checkFolderMovePolicyBlock(
          { subtree, projectId, environment: destination.environment, rootFolderPath: destination.path },
          folderMoveBlockDeps
        )
      : null;

    return { sourceBlock, destinationBlock };
  };

  // checks whether a folder (and its entire recursive subtree) can be moved. when a destination is supplied, it
  // also reports whether the destination is governed by a secret approval policy (a move into such a path is
  // rejected by moveFolder), so the caller can block the move before attempting it.
  const getFolderMoveEligibility = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    id,
    destinationEnvironment,
    destinationPath
  }: TGetFolderMoveEligibilityDTO): Promise<TFolderMoveEligibility> => {
    const folder = await getFolderById({ actor, actorId, actorOrgId, actorAuthMethod, id });

    // resolve the actor's ability so subtree disclosure is gated by per-path read permission. this is
    // request-memoized, so it reuses the lookup getFolderById already performed (no extra DB read).
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: folder.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    const accessScope: TFolderMoveAccessScope = {
      permission,
      environment: folder.environment.envSlug,
      rootFolderPath: folder.path
    };

    const destinationParentPath = destinationPath ?? "/";
    const canActorAccessDestination =
      !!destinationEnvironment &&
      permission.can(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, {
          environment: destinationEnvironment,
          secretPath: destinationParentPath
        })
      ) &&
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.SecretFolders, {
          environment: destinationEnvironment,
          secretPath: destinationParentPath
        })
      );

    // run every read inside a transaction so it hits the primary database rather than a read replica
    const { sourceBlock, destinationBlock } = await folderDAL.transaction(async (tx) => {
      // parent folder + full recursive subtree (with paths); reserved folders are already excluded.
      const subtree = await folderDAL.findByEnvsDeep({ parentIds: [folder.id] }, tx);

      return $getFolderMoveBlocks(
        {
          subtree,
          projectId: folder.projectId,
          sourceEnvironment: folder.environment.envSlug,
          sourceFolderPath: folder.path,
          destination:
            destinationEnvironment && canActorAccessDestination
              ? { environment: destinationEnvironment, path: path.join(destinationParentPath, folder.name) }
              : undefined,
          accessScope
        },
        tx
      );
    });

    const readableDestinationBlock =
      canActorAccessDestination &&
      destinationBlock &&
      destinationEnvironment &&
      canActorReadBlock(permission, destinationEnvironment, "secret_approval_policy", destinationBlock.blockingAbsPath)
        ? destinationBlock
        : undefined;

    return {
      canMove: !sourceBlock,
      folderName: folder.name,
      blockingType: sourceBlock?.blockingType,
      blockingPath: sourceBlock?.blockingAbsPath,
      destinationBlocked: destinationEnvironment ? !canActorAccessDestination || Boolean(destinationBlock) : undefined,
      destinationBlockingPath: readableDestinationBlock?.blockingPath,
      destinationPolicyName: readableDestinationBlock?.policyName
    };
  };

  // moves a folder (and its entire static-secret subtree) to a new path, optionally in a different environment.
  // strategy: inside ONE transaction, enumerate + lock the source subtree, recreate the folder tree at the
  // destination (parent links resolved from pre-generated ids), move every folder's secrets via
  // fnSecretMoveInTransaction, then delete the emptied source root, so the whole move is atomic and the row lock is
  // held throughout. snapshots/syncs/cache are dispatched once after commit. a folder whose subtree is governed by a
  // source secret approval policy is rejected up front, so the source is always fully emptied before the delete; a
  // move into a destination governed by a secret approval policy is likewise rejected up front.
  const moveFolder = async ({
    projectId,
    folderId,
    destinationEnvironment,
    destinationPath,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TMoveFolderDTO): Promise<TMoveFolderResult> => {
    // 1. resolve the source folder (getFolderById also runs the project-level permission check)
    const sourceFolder = await getFolderById({ actor, actorId, actorOrgId, actorAuthMethod, id: folderId });
    const sourceEnvironment = sourceFolder.environment.envSlug;
    const sourceFolderPath = sourceFolder.path;
    const folderName = sourceFolder.name;
    const sourceParentPath = path.dirname(sourceFolderPath);

    // check if the folder is in the same project
    if (projectId !== sourceFolder.projectId) {
      throw new BadRequestError({
        message: "The provided project ID does not match the source folder's project ID"
      });
    }

    // check if the source folder is not root
    if (sourceFolderPath === "/" || !sourceFolder.parentId) {
      throw new BadRequestError({
        message: "Cannot move the root folder"
      });
    }

    // 2. permission: a move is create-at-destination + delete-at-source (secret-level perms are enforced in moveSecrets)
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.SecretFolders, { environment: destinationEnvironment, secretPath: destinationPath })
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.SecretFolders, { environment: sourceEnvironment, secretPath: sourceParentPath })
    );

    // 3. cyclic / no-op validation (only meaningful within the same environment)
    if (destinationEnvironment === sourceEnvironment) {
      if (destinationPath === sourceFolderPath || destinationPath.startsWith(`${sourceFolderPath}/`)) {
        throw new BadRequestError({
          message: "Cannot move a folder into itself or one of its own subfolders"
        });
      }
      if (destinationPath === sourceParentPath) {
        throw new BadRequestError({
          message: `Folder '${folderName}' is already located at path '${destinationPath}'`
        });
      }
    }

    // 4. perform the whole move inside ONE transaction so it is atomic and the source-folder row lock is held for
    // the entire operation: enumerate + lock the source subtree, recreate the tree at the destination, move every
    // folder's secrets (sharing this tx), then delete the emptied source root. a failure anywhere rolls all of
    // it back. side effects (snapshots/syncs/cache) are dispatched after the commit.
    const { moveResults } = await folderDAL.transaction(async (tx) => {
      const destinationParentFolder = await folderDAL.findBySecretPath(
        projectId,
        destinationEnvironment,
        destinationPath,
        tx
      );
      if (!destinationParentFolder) {
        throw new NotFoundError({
          message: `Destination folder with path '${destinationPath}' in environment '${destinationEnvironment}' not found`
        });
      }
      const finalDestinationPath = path.join(destinationPath, folderName);
      const existingDestinationFolder = await folderDAL.findBySecretPath(
        projectId,
        destinationEnvironment,
        finalDestinationPath,
        tx
      );
      if (existingDestinationFolder) {
        throw new BadRequestError({
          message: `A folder named '${folderName}' already exists at path '${destinationPath}' in environment '${destinationEnvironment}'`
        });
      }

      const destinationFolderRoot = finalDestinationPath;
      const destinationEnvId = destinationParentFolder.envId;
      // locking the source folder rows blocks concurrent secret inserts into them (secret -> folder FK) until commit.
      const subtree = await folderDAL.findByEnvsDeep({ parentIds: [sourceFolder.id] }, tx);
      await folderDAL.lockFoldersForUpdate(
        subtree.map((f) => f.id),
        tx
      );

      // absolute source path of a subtree folder (the moved folder itself is "/"). reused below when building the plan.
      const toSourceAbsPath = (f: { path: string }) =>
        f.path === "/" ? sourceFolderPath : `${sourceFolderPath}${f.path}`;

      // the source subtree must contain only static secrets and must not be governed by a secret approval policy, and
      // the destination must not be governed by one either. the scan covers the full subtree (no access scope) so a
      // block always prevents the move; the thrown message only reveals the offending path/type when the actor is
      // allowed to read it, otherwise it stays generic.
      const { sourceBlock, destinationBlock } = await $getFolderMoveBlocks(
        {
          subtree,
          projectId,
          sourceEnvironment,
          sourceFolderPath,
          destination: { environment: destinationEnvironment, path: destinationFolderRoot }
        },
        tx
      );
      if (sourceBlock) {
        assertFolderMoveAllowed(sourceBlock, {
          permission,
          environment: sourceEnvironment,
          folderName,
          scope: "source"
        });
      }
      if (destinationBlock) {
        assertFolderMoveAllowed(destinationBlock, {
          permission,
          environment: destinationEnvironment,
          folderName,
          scope: "destination"
        });
      }

      const subtreeSecrets = await secretV2BridgeDAL.findByFolderIds({ folderIds: subtree.map((f) => f.id), tx });
      const secretIdsByFolderId = new Map<string, string[]>();
      for (const secret of subtreeSecrets) {
        const list = secretIdsByFolderId.get(secret.folderId) ?? [];
        list.push(secret.id);
        secretIdsByFolderId.set(secret.folderId, list);
      }

      // pre-generate a destination id for every source folder so parent links are known up front. this lets us
      // insert the folders with correct parentIds in dependency order and lets the
      // secret move resolve each destination path within this tx. relativePath is relative to the moved folder,
      // where the folder itself is "/".
      const idBySourceFolderId = new Map<string, string>(subtree.map((f) => [f.id, uuidv4()]));
      const plan = subtree
        .slice()
        .sort((a, b) => a.depth - b.depth) // root first: a parent is always created before its children
        .map((f) => {
          const relativePath = f.path;
          const sourceAbsPath = toSourceAbsPath(f);
          const destinationAbsPath =
            relativePath === "/" ? destinationFolderRoot : `${destinationFolderRoot}${relativePath}`;
          // the subtree root re-parents onto the destination parent; every other folder onto its mapped new parent.
          const newParentId =
            f.id === sourceFolder.id
              ? destinationParentFolder.id
              : (idBySourceFolderId.get(f.parentId as string) as string);
          return {
            newFolderId: idBySourceFolderId.get(f.id) as string,
            name: f.name,
            description: f.description,
            depth: f.depth,
            newParentId,
            sourceAbsPath,
            destinationAbsPath,
            secretIds: secretIdsByFolderId.get(f.id) ?? []
          };
        });

      // pre-authorize folder create/delete across the entire subtree before any write. a move recreates each
      // folder at its destination parent and removes it from its source parent, so the actor needs Delete at every
      // source parent path and Create at every destination parent path. paths are deduped because subtree siblings
      // share a parent. folder permissions are path-scoped (glob conditions can differ per nested path), so the
      // root-only check performed before the transaction is not sufficient.
      const checkedSourceParents = new Set<string>();
      const checkedDestinationParents = new Set<string>();
      for (const entry of plan) {
        const sourceParent = path.dirname(entry.sourceAbsPath);
        if (!checkedSourceParents.has(sourceParent)) {
          checkedSourceParents.add(sourceParent);
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionActions.Delete,
            subject(ProjectPermissionSub.SecretFolders, { environment: sourceEnvironment, secretPath: sourceParent })
          );
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionActions.Read,
            subject(ProjectPermissionSub.SecretFolders, { environment: sourceEnvironment, secretPath: sourceParent })
          );
        }
        const destinationParent = path.dirname(entry.destinationAbsPath);
        if (!checkedDestinationParents.has(destinationParent)) {
          checkedDestinationParents.add(destinationParent);
          ForbiddenError.from(permission).throwUnlessCan(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.SecretFolders, {
              environment: destinationEnvironment,
              secretPath: destinationParent
            })
          );
        }
      }

      // pre-authorize the secret moves for the entire subtree before any write, so an unauthorized move fails
      // before anything is created or moved. each folder that holds secrets is checked once at its own
      // source/destination path.
      for (const entry of plan) {
        if (!entry.secretIds.length) {
          // eslint-disable-next-line no-continue
          continue;
        }
        validateSecretMovePermissions(permission, {
          sourceEnvironment,
          sourceSecretPath: entry.sourceAbsPath,
          destinationEnvironment,
          destinationSecretPath: entry.destinationAbsPath
        });
      }

      // 6. recreate the folder tree at the destination. inserting root-first satisfies the self-referencing
      // parentId FK; each new folder also gets a version row and an ADD commit (mirrors createManyFolders).
      const newFolderRows: TSecretFoldersInsert[] = plan.map((entry) => ({
        id: entry.newFolderId,
        name: entry.name,
        envId: destinationEnvId,
        parentId: entry.newParentId,
        version: 1,
        description: entry.description
      }));
      const createdFolders = await folderDAL.insertMany(newFolderRows, tx);

      const newParentIdByNewFolderId = new Map<string, string>(
        plan.map((entry) => [entry.newFolderId, entry.newParentId])
      );

      const createdVersions = await folderVersionDAL.insertMany(
        createdFolders.map((doc) => ({
          name: doc.name,
          envId: doc.envId,
          version: doc.version,
          folderId: doc.id,
          description: doc.description
        })),
        tx
      );
      for (const folderVersion of createdVersions) {
        await folderCommitService.createCommit(
          {
            actor: { type: actor, metadata: { id: actorId } },
            message: "Folder moved",
            folderId: newParentIdByNewFolderId.get(folderVersion.folderId) as string,
            changes: [{ type: CommitType.ADD, folderVersionId: folderVersion.id }]
          },
          tx
        );
      }

      // 7. move every folder's secrets inside this same transaction (root first), so the whole subtree move is
      // atomic. fnSecretMoveInTransaction performs the move only; its snapshots and syncs are dispatched once, per
      // affected folder, after commit. moves run sequentially because they share this one connection, and each
      // destination path resolves from the folders just created above.
      const moveResultsList: TFnSecretMoveResult[] = [];
      for (const entry of plan) {
        if (!entry.secretIds.length) {
          // eslint-disable-next-line no-continue
          continue;
        }
        moveResultsList.push(
          await fnSecretMoveInTransaction({
            projectId,
            sourceEnvironment,
            sourceSecretPath: entry.sourceAbsPath,
            destinationEnvironment,
            destinationSecretPath: entry.destinationAbsPath,
            secretIds: entry.secretIds,
            shouldOverwrite: false,
            actor,
            actorId,
            actorAuthMethod,
            actorOrgId,
            tx,
            permissionService,
            kmsService,
            folderDAL,
            secretDAL: secretV2BridgeDAL,
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
          })
        );
      }

      // 8. delete the source root. secret_folders.parentId and secrets_v2.folderId both cascade on delete, so
      // removing only the source root removes the entire subtree. the source is always fully emptied here: a
      // subtree governed by a source approval policy was rejected up front, so no secret is left pending.
      const [deletedRoot] = await folderDAL.delete({ id: sourceFolder.id }, tx);
      const latestVersions = await folderVersionDAL.findLatestFolderVersions([deletedRoot.id], tx);
      await folderCommitService.createCommit(
        {
          actor: { type: actor, metadata: { id: actorId } },
          message: "Folder moved",
          folderId: deletedRoot.parentId as string,
          changes: [
            {
              type: CommitType.DELETE,
              folderVersionId: latestVersions[deletedRoot.id].id,
              folderId: deletedRoot.id
            }
          ]
        },
        tx
      );

      return {
        moveResults: moveResultsList
      };
    });

    // now that the move has committed, dispatch side effects once: sync each affected source/destination
    // secret folder, then invalidate the project secret cache.
    await Promise.all(
      moveResults.map((result) =>
        secretV2BridgeService.dispatchSecretMoveSideEffects({
          projectId,
          orgId: actorOrgId,
          actor,
          actorId,
          ...result
        })
      )
    );

    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);

    return {
      folderId,
      sourceEnvironment,
      sourcePath: sourceFolderPath,
      destinationEnvironment,
      destinationPath
    };
  };

  return {
    createFolder,
    updateFolder,
    updateManyFolders,
    deleteFolder,
    getFolders,
    getFolderById,
    getFolderMoveEligibility,
    moveFolder,
    getFolderByPath,
    getProjectFolderCount,
    getFoldersMultiEnv,
    getFoldersDeepByEnvs,
    getProjectEnvironmentsFolders,
    getFolderVersionsByIds,
    getFolderVersions,
    createManyFolders,
    deleteManyFolders
  };
};
