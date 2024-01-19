import { ForbiddenError, subject } from "@casl/ability";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { TSecretFoldersInsert } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretFolderDALFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFolderDTO,
  TUpdateFolderDTO
} from "./secret-folder-types";
import { TSecretFolderVersionDALFactory } from "./secret-folder-version-dal";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  folderDAL: TSecretFolderDALFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  folderVersionDAL: TSecretFolderVersionDALFactory;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDAL,
  snapshotService,
  permissionService,
  projectEnvDAL,
  folderVersionDAL
}: TSecretFolderServiceFactoryDep) => {
  const createFolder = async ({
    projectId,
    actor,
    actorId,
    name,
    environment,
    path: secretPath
  }: TCreateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDAL.transaction(async (tx) => {
      // the logic is simple we need to avoid creating same folder in same path multiple times
      // that is this request must be idempotent
      // so we do a tricky move. we try to find the to be created folder path if that is exactly match return that
      // else we get some path before that then we will start creating remaining folder
      const pathWithFolder = path.join(secretPath, name);
      const parentFolder = await folderDAL.findClosestFolder(
        projectId,
        environment,
        pathWithFolder,
        tx
      );
      // no folder found is not possible root should be their
      if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });
      // exact folder
      if (parentFolder.path === pathWithFolder) return parentFolder;

      let parentFolderId = parentFolder.id;
      if (parentFolder.path !== secretPath) {
        // this is upsert folder in a path
        // we are not taking snapshots of this because
        // snapshot will be removed from automatic for all commits to user click or cron based
        const missingSegment = secretPath
          .substring(parentFolder.path.length)
          .split("/")
          .filter(Boolean);
        if (missingSegment.length) {
          const newFolders: Array<TSecretFoldersInsert & { id: string }> = missingSegment.map(
            (segment, i) =>
              i === 0
                ? {
                    name: segment,
                    parentId: parentFolder.id,
                    id: uuidv4(),
                    envId: env.id,
                    version: 1
                  }
                : {
                    name: segment,
                    parentId: newFolders[i - 1].id,
                    id: uuidv4(),
                    envId: env.id,
                    version: 1
                  }
          );
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

      const doc = await folderDAL.create(
        { name, envId: env.id, version: 1, parentId: parentFolderId },
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
      return doc;
    });

    await snapshotService.performSnapshot(folder.parentId as string);
    return folder;
  };

  const updateFolder = async ({
    projectId,
    actor,
    actorId,
    name,
    environment,
    path: secretPath,
    id
  }: TUpdateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Update folder" });
    let folder = await folderDAL.findOne({ envId: env.id, id, parentId: parentFolder.id });
    // now folder api accepts id based change
    // this is for cli and when cli removes this will remove this logic
    if (!folder) {
      folder = await folderDAL.findOne({ envId: env.id, name: id, parentId: parentFolder.id });
    }
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const newFolder = await folderDAL.transaction(async (tx) => {
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
      if (!doc) throw new BadRequestError({ message: "Folder not found", name: "Update folder" });
      return doc;
    });

    await snapshotService.performSnapshot(newFolder.parentId as string);
    return { folder: newFolder, old: folder };
  };

  const deleteFolder = async ({
    projectId,
    actor,
    actorId,
    environment,
    path: secretPath,
    id
  }: TDeleteFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDAL.transaction(async (tx) => {
      const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, tx);
      if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });

      const [doc] = await folderDAL.delete({ envId: env.id, id, parentId: parentFolder.id }, tx);
      if (!doc) throw new BadRequestError({ message: "Folder not found", name: "Delete folder" });
      return doc;
    });

    await snapshotService.performSnapshot(folder.parentId as string);
    return folder;
  };

  const getFolders = async ({
    projectId,
    actor,
    actorId,
    environment,
    path: secretPath
  }: TGetFolderDTO) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission(actor, actorId, projectId);

    const env = await projectEnvDAL.findOne({ projectId, slug: environment });
    if (!env) throw new BadRequestError({ message: "Environment not found", name: "get folders" });

    const parentFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!parentFolder) return [];

    const folders = await folderDAL.find({ envId: env.id, parentId: parentFolder.id });
    return folders;
  };

  return {
    createFolder,
    updateFolder,
    deleteFolder,
    getFolders
  };
};
