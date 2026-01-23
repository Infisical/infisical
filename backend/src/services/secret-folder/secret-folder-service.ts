/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";
import { Knex } from "knex";
import path from "path";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";

import { ActionProjectType } from "@app/db/schemas/models";
import { TProjectEnvironments } from "@app/db/schemas/project-environments";
import { TSecretFolders, TSecretFoldersInsert } from "@app/db/schemas/secret-folders";
import { TDynamicSecretDALFactory } from "@app/ee/services/dynamic-secret/dynamic-secret-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyServiceFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-service";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { PgSqlLock } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
import { SecretsOrderBy } from "@app/services/secret/secret-types";
import { buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

import {
  ChangeType,
  CommitType,
  TCommitResourceChangeDTO,
  TFolderCommitServiceFactory
} from "../folder-commit/folder-commit-service";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TCreateManyFoldersDTO,
  TDeleteFolderDTO,
  TDeleteManyFoldersDTO,
  TGetFolderByIdDTO,
  TGetFolderByPathDTO,
  TGetFolderDTO,
  TGetFoldersDeepByEnvsDTO,
  TUpdateFolderDTO,
  TUpdateManyFoldersDTO
} from "./secret-folder-types";
import { TSecretFolderVersionDALFactory } from "./secret-folder-version-dal";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "findBySlugs" | "find">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestFolderVersions" | "create" | "insertMany" | "find">;
  folderCommitService: Pick<TFolderCommitServiceFactory, "createCommit">;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  secretV2BridgeDAL: Pick<
    TSecretV2BridgeDALFactory,
    "findByFolderIds" | "invalidateSecretCacheByProjectId" | "findOne"
  >;
  dynamicSecretDAL: Pick<TDynamicSecretDALFactory, "findOne">;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDAL,
  snapshotService,
  permissionService,
  projectEnvDAL,
  folderVersionDAL,
  folderCommitService,
  projectDAL,
  secretApprovalPolicyService,
  secretV2BridgeDAL,
  dynamicSecretDAL
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

      return doc;
    });

    const [folderWithFullPath] = await folderDAL.findSecretPathByFolderIds(projectId, [folder.id]);

    if (!folderWithFullPath) {
      throw new NotFoundError({
        message: `Failed to retrieve path for folder with ID '${folder.id}'`
      });
    }

    await snapshotService.performSnapshot(folder.parentId as string);
    return { ...folder, path: folderWithFullPath.path };
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

    await Promise.all(result.map(async (res) => snapshotService.performSnapshot(res.newFolder.parentId as string)));

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

    const newFolder = await folderDAL.transaction(async (tx) => {
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
      return doc;
    });

    const foldersWithFullPaths = await folderDAL.findSecretPathByFolderIds(projectId, [newFolder.id, folder.id]);

    const newFolderWithFullPath = foldersWithFullPaths.find((f) => f?.id === newFolder.id);
    if (!newFolderWithFullPath) {
      throw new NotFoundError({
        message: `Failed to retrieve path for folder with ID '${newFolder.id}'`
      });
    }

    const folderWithFullPath = foldersWithFullPaths.find((f) => f?.id === folder.id);
    if (!folderWithFullPath) {
      throw new NotFoundError({
        message: `Failed to retrieve path for folder with ID '${folder.id}'`
      });
    }

    await snapshotService.performSnapshot(newFolder.parentId as string);
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    return {
      folder: { ...newFolder, path: newFolderWithFullPath.path },
      old: { ...folder, path: folderWithFullPath.path }
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

    await snapshotService.performSnapshot(folder.parentId as string);
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
        $search: search ? { name: `%${search}%` } : undefined
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
    const uniqueParentIds = [...new Set(result.map((folder) => folder.parentId).filter(Boolean))];
    await Promise.all(uniqueParentIds.map((parentId) => snapshotService.performSnapshot(parentId as string)));

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

    const uniqueParentIds = [...new Set(result.map((folder) => folder.parentId).filter(Boolean))];
    await Promise.all(uniqueParentIds.map((parentId) => snapshotService.performSnapshot(parentId as string)));

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

  return {
    createFolder,
    updateFolder,
    updateManyFolders,
    deleteFolder,
    getFolders,
    getFolderById,
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
