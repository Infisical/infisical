import { ForbiddenError, subject } from "@casl/ability";
import path from "path";
import { v4 as uuidv4, validate as uuidValidate } from "uuid";

import { TSecretFoldersInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrderByDirection } from "@app/lib/types";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import { shouldCheckFolderPermission } from "./secret-folder-fns";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFolderByIdDTO,
  TGetFolderDTO,
  TUpdateFolderDTO,
  TUpdateManyFoldersDTO
} from "./secret-folder-types";
import { TSecretFolderVersionDALFactory } from "./secret-folder-version-dal";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne" | "findBySlugs">;
  folderVersionDAL: TSecretFolderVersionDALFactory;
  projectDAL: Pick<TProjectDALFactory, "findProjectBySlug">;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDAL,
  snapshotService,
  permissionService,
  projectEnvDAL,
  folderVersionDAL,
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
    path: secretPath
  }: TCreateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    // we do this because we've split Secret and SecretFolder resources
    // previously, if one can create/update/read/delete secrets then they can do the same for folders
    // for backwards compatibility, we handle authorization only when SecretFolders subject is used
    if (shouldCheckFolderPermission(permission.rules)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Create,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    }

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDAL.transaction(async (tx) => {
      // the logic is simple we need to avoid creating same folder in same path multiple times
      // that is this request must be idempotent
      // so we do a tricky move. we try to find the to be created folder path if that is exactly match return that
      // else we get some path before that then we will start creating remaining folder
      const pathWithFolder = path.join(secretPath, name);
      const parentFolder = await folderDAL.findClosestFolder(projectId, environment, pathWithFolder, tx);
      // no folder found is not possible root should be their
      if (!parentFolder) throw new NotFoundError({ message: "Secret path not found" });
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
          await folderVersionDAL.insertMany(
            docs.map((doc) => ({
              name: doc.name,
              envId: doc.envId,
              version: doc.version,
              folderId: doc.id
            })),
            tx
          );
        }
      }

      const doc = await folderDAL.create({ name, envId: env.id, version: 1, parentId: parentFolderId }, tx);
      await folderVersionDAL.create(
        {
          name: doc.name,
          envId: doc.envId,
          version: doc.version,
          folderId: doc.id
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
      throw new NotFoundError({ message: "Project not found" });
    }

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      project.id,
      actorAuthMethod,
      actorOrgId
    );

    folders.forEach(({ environment, path: secretPath }) => {
      // we do this because we've split Secret and SecretFolder resources
      // previously, if one can create/update/read/delete secrets then they can do the same for folders
      // for backwards compatibility, we handle authorization only when SecretFolders subject is used
      if (shouldCheckFolderPermission(permission.rules)) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Edit,
          subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
        );
      } else {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionActions.Edit,
          subject(ProjectPermissionSub.Secrets, { environment, secretPath })
        );
      }
    });

    const result = await folderDAL.transaction(async (tx) =>
      Promise.all(
        folders.map(async (newFolder) => {
          const { environment, path: secretPath, id, name } = newFolder;

          const parentFolder = await folderDAL.findBySecretPath(project.id, environment, secretPath);
          if (!parentFolder) {
            throw new NotFoundError({ message: "Secret path not found", name: "Batch update folder" });
          }

          const env = await projectEnvDAL.findOne({ projectId: project.id, slug: environment });
          if (!env) {
            throw new NotFoundError({ message: "Environment not found", name: "Batch update folder" });
          }
          const folder = await folderDAL
            .findOne({ envId: env.id, id, parentId: parentFolder.id })
            // now folder api accepts id based change
            // this is for cli backward compatiability and when cli removes this, we will remove this logic
            .catch(() => folderDAL.findOne({ envId: env.id, name: id, parentId: parentFolder.id }));

          if (!folder) {
            throw new NotFoundError({ message: "Folder not found" });
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
            { name },
            tx
          );
          await folderVersionDAL.create(
            {
              name: doc.name,
              envId: doc.envId,
              version: doc.version,
              folderId: doc.id
            },
            tx
          );
          if (!doc) {
            throw new NotFoundError({ message: "Folder not found", name: "Batch update folder" });
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
    id
  }: TUpdateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    // we do this because we've split Secret and SecretFolder resources
    // previously, if one can create/update/read/delete secrets then they can do the same for folders
    // for backwards compatibility, we handle authorization differently only when SecretFolders subject is used
    if (shouldCheckFolderPermission(permission.rules)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Edit,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    }

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder) throw new NotFoundError({ message: "Secret path not found" });

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: "Environment not found", name: "Update folder" });
    const folder = await folderDAL
      .findOne({ envId: env.id, id, parentId: parentFolder.id, isReserved: false })
      // now folder api accepts id based change
      // this is for cli backward compatiability and when cli removes this, we will remove this logic
      .catch(() => folderDAL.findOne({ envId: env.id, name: id, parentId: parentFolder.id }));

    if (!folder) throw new NotFoundError({ message: "Folder not found" });
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
          name: "Update folder"
        });
      }
    }

    const newFolder = await folderDAL.transaction(async (tx) => {
      const [doc] = await folderDAL.update(
        { envId: env.id, id: folder.id, parentId: parentFolder.id, isReserved: false },
        { name },
        tx
      );
      await folderVersionDAL.create(
        {
          name: doc.name,
          envId: doc.envId,
          version: doc.version,
          folderId: doc.id
        },
        tx
      );
      if (!doc) throw new NotFoundError({ message: "Folder not found", name: "Update folder" });
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
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    // we do this because we've split Secret and SecretFolder resources
    // previously, if one can create/update/read/delete secrets then they can do the same for folders
    // for backwards compatibility, we handle authorization differently only when SecretFolders subject is used
    if (shouldCheckFolderPermission(permission.rules)) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionActions.Delete,
        subject(ProjectPermissionSub.Secrets, { environment, secretPath })
      );
    }

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDAL.transaction(async (tx) => {
      const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, tx);
      if (!parentFolder) throw new NotFoundError({ message: "Secret path not found" });

      const [doc] = await folderDAL.delete(
        {
          envId: env.id,
          [uuidValidate(idOrName) ? "id" : "name"]: idOrName,
          parentId: parentFolder.id,
          isReserved: false
        },
        tx
      );
      if (!doc) throw new NotFoundError({ message: "Folder not found", name: "Delete folder" });
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
    offset
  }: TGetFolderDTO) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission(actor, actorId, projectId, actorAuthMethod, actorOrgId);

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new NotFoundError({ message: "Environment not found", name: "get folders" });

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder) return [];

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
    await permissionService.getProjectPermission(actor, actorId, projectId, actorAuthMethod, actorOrgId);

    const envs = await projectEnvDAL.findBySlugs(projectId, environments);

    if (!envs.length)
      throw new NotFoundError({ message: "Environment(s) not found", name: "get project folder count" });

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
    await permissionService.getProjectPermission(actor, actorId, projectId, actorAuthMethod, actorOrgId);

    const envs = await projectEnvDAL.findBySlugs(projectId, environments);

    if (!envs.length)
      throw new NotFoundError({ message: "Environment(s) not found", name: "get project folder count" });

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
    if (!folder) throw new NotFoundError({ message: "Folder not found" });
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission(actor, actorId, folder.projectId, actorAuthMethod, actorOrgId);

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(folder.projectId, [folder.id]);

    if (!folderWithPath) {
      throw new NotFoundError({ message: "Folder path not found" });
    }

    return {
      ...folder,
      path: folderWithPath.path
    };
  };

  return {
    createFolder,
    updateFolder,
    updateManyFolders,
    deleteFolder,
    getFolders,
    getFolderById,
    getProjectFolderCount,
    getFoldersMultiEnv
  };
};
