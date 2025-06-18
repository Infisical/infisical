import { ForbiddenError, subject } from "@casl/ability";
import path from "path";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";

import { ActionProjectType, TSecretFoldersInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection, OrgServiceActor } from "@app/lib/types";
import { buildFolderPath } from "@app/services/secret-folder/secret-folder-fns";

import { ChangeType, CommitType, TFolderCommitServiceFactory } from "../folder-commit/folder-commit-service";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFolderByIdDTO,
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
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDAL,
  snapshotService,
  permissionService,
  projectEnvDAL,
  folderVersionDAL,
  folderCommitService,
  projectDAL
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
      const pathWithFolder = path.join(secretPath, name);
      const parentFolder = await folderDAL.findClosestFolder(projectId, environment, pathWithFolder, tx);
      // no folder found is not possible root should be their
      if (!parentFolder) {
        throw new NotFoundError({
          message: `Folder with path '${pathWithFolder}' in environment with slug '${environment}' not found`
        });
      }
      // exact folder
      if (parentFolder.path === pathWithFolder) return parentFolder;

      let parentFolderId = parentFolder.id;
      if (parentFolder.path !== secretPath) {
        // this is upsert folder in a path
        // we are not taking snapshots of this because
        // snapshot will be removed from automatic for all commits to user click or cron based
        const missingSegment = secretPath.substring(parentFolder.path.length).split("/").filter(Boolean);
        if (missingSegment.length) {
          const newFolders: Array<TSecretFoldersInsert & { id: string }> = missingSegment.map((segment) => {
            const newFolder = {
              name: segment,
              parentId: parentFolderId,
              id: uuidv4(),
              envId: env.id,
              version: 1
            };
            parentFolderId = newFolder.id;
            return newFolder;
          });
          parentFolderId = newFolders.at(-1)?.id as string;
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
              folderId: parentFolderId,
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
        { name, envId: env.id, version: 1, parentId: parentFolderId, description },
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
          folderId: parentFolderId,
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

    await snapshotService.performSnapshot(folder.parentId as string);
    return folder;
  };

  const updateManyFolders = async ({
    actor,
    actorId,
    projectSlug,
    actorAuthMethod,
    actorOrgId,
    folders
  }: TUpdateManyFoldersDTO) => {
    const project = await projectDAL.findProjectBySlug(projectSlug, actorOrgId);
    if (!project) {
      throw new NotFoundError({ message: `Project with slug '${projectSlug}' not found` });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: project.id,
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

    const result = await folderDAL.transaction(async (tx) =>
      Promise.all(
        folders.map(async (newFolder) => {
          const { environment, path: secretPath, id, name, description } = newFolder;

          const parentFolder = await folderDAL.findBySecretPath(project.id, environment, secretPath);
          if (!parentFolder) {
            throw new NotFoundError({
              message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
              name: "UpdateManyFolders"
            });
          }

          const env = await projectEnvDAL.findOne({ projectId: project.id, slug: environment });
          if (!env) {
            throw new NotFoundError({
              message: `Environment with slug '${environment}' in project with ID '${project.id}' not found`,
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
          if (!doc) {
            throw new NotFoundError({
              message: `Failed to update folder with id '${id}', not found`,
              name: "UpdateManyFolders"
            });
          }

          return { oldFolder: folder, newFolder: doc };
        })
      )
    );

    await Promise.all(result.map(async (res) => snapshotService.performSnapshot(res.newFolder.parentId as string)));

    return {
      projectId: project.id,
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

    await snapshotService.performSnapshot(newFolder.parentId as string);
    return { folder: newFolder, old: folder };
  };

  const deleteFolder = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    environment,
    path: secretPath,
    idOrName
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

      const [doc] = await folderDAL.delete(
        {
          envId: env.id,
          [uuidValidate(idOrName) ? "id" : "name"]: idOrName,
          parentId: parentFolder.id,
          isReserved: false
        },
        tx
      );

      if (!doc) throw new NotFoundError({ message: `Failed to delete folder with ID '${idOrName}', not found` });

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
      const recursiveFolders = await folderDAL.findByEnvsDeep({ parentIds: [parentFolder.id] });
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

    const folders = await folderDAL.find(
      {
        envId: env.id,
        parentId: parentFolder.id,
        isReserved: false,
        $search: search ? { name: `%${search}%` } : undefined
      },
      {
        sort: orderBy ? [[orderBy, orderDirection ?? OrderByDirection.ASC]] : undefined,
        limit,
        offset
      }
    );
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

  return {
    createFolder,
    updateFolder,
    updateManyFolders,
    deleteFolder,
    getFolders,
    getFolderById,
    getProjectFolderCount,
    getFoldersMultiEnv,
    getFoldersDeepByEnvs,
    getProjectEnvironmentsFolders,
    getFolderVersionsByIds,
    getFolderVersions
  };
};
