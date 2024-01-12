import { ForbiddenError, subject } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TSecretSnapshotServiceFactory } from "@app/ee/services/secret-snapshot/secret-snapshot-service";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { TSecretFolderDalFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFolderDTO,
  TUpdateFolderDTO
} from "./secret-folder-types";
import { TSecretFolderVersionDalFactory } from "./secret-folder-version-dal";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  snapshotService: Pick<TSecretSnapshotServiceFactory, "performSnapshot">;
  folderDal: TSecretFolderDalFactory;
  projectEnvDal: Pick<TProjectEnvDalFactory, "findOne">;
  folderVersionDal: TSecretFolderVersionDalFactory;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDal,
  snapshotService,
  permissionService,
  projectEnvDal,
  folderVersionDal
}: TSecretFolderServiceFactoryDep) => {
  const createFolder = async ({
    projectId,
    actor,
    actorId,
    name,
    environment,
    path
  }: TCreateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDal.transaction(async (tx) => {
      const parentFolder = await folderDal.findBySecretPath(projectId, environment, path, tx);
      if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });
      const doc = await folderDal.create(
        { name, envId: env.id, version: 1, parentId: parentFolder.id },
        tx
      );
      await folderVersionDal.create(
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
    path,
    id
  }: TUpdateFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const parentFolder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Update folder" });
    let folder = await folderDal.findOne({ envId: env.id, id, parentId: parentFolder.id });
    // now folder api accepts id based change
    // this is for cli and when cli removes this will remove this logic
    if (!folder) {
      folder = await folderDal.findOne({ envId: env.id, name: id, parentId: parentFolder.id });
    }
    if (!folder) throw new BadRequestError({ message: "Folder not found" });

    const newFolder = await folderDal.transaction(async (tx) => {
      const [doc] = await folderDal.update(
        { envId: env.id, id: folder.id, parentId: parentFolder.id },
        { name },
        tx
      );
      await folderVersionDal.create(
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
    path,
    id
  }: TDeleteFolderDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDal.transaction(async (tx) => {
      const parentFolder = await folderDal.findBySecretPath(projectId, environment, path, tx);
      if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });

      const [doc] = await folderDal.delete({ envId: env.id, id, parentId: parentFolder.id }, tx);
      if (!doc) throw new BadRequestError({ message: "Folder not found", name: "Delete folder" });
      return doc;
    });

    await snapshotService.performSnapshot(folder.parentId as string);
    return folder;
  };

  const getFolders = async ({ projectId, actor, actorId, environment, path }: TGetFolderDTO) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission(actor, actorId, projectId);

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env) throw new BadRequestError({ message: "Environment not found", name: "get folders" });

    const parentFolder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!parentFolder) throw new BadRequestError({ message: "Secret path not found" });

    const folders = await folderDal.find({ envId: env.id, parentId: parentFolder.id });
    return folders;
  };

  return {
    createFolder,
    updateFolder,
    deleteFolder,
    getFolders
  };
};
