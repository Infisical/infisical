import { ForbiddenError, subject } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { ROOT_FOLDER_NAME, TSecretFolderDalFactory } from "./secret-folder-dal";
import {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TGetFolderDTO,
  TUpdateFolderDTO
} from "./secret-folder-types";

type TSecretFolderServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDal: TSecretFolderDalFactory;
  projectEnvDal: Pick<TProjectEnvDalFactory, "findOne">;
};

export type TSecretFolderServiceFactory = ReturnType<typeof secretFolderServiceFactory>;

export const secretFolderServiceFactory = ({
  folderDal,
  permissionService,
  projectEnvDal
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
      const doc = await folderDal.create({ name, envId: env.id, version: 1 }, tx);
      return doc;
    });

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

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folder = await folderDal.transaction(async (tx) => {
      const [doc] = await folderDal.update({ envId: env.id, id }, { name, version: 1 }, tx);
      if (!doc) throw new BadRequestError({ message: "Folder not found", name: "Update folder" });
      return doc;
    });

    return folder;
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
      const [doc] = await folderDal.delete({ envId: env.id, id }, tx);
      if (!doc) throw new BadRequestError({ message: "Folder not found", name: "Delete folder" });
      return doc;
    });

    return folder;
  };

  const getFolders = async ({ projectId, actor, actorId, environment }: TGetFolderDTO) => {
    // folder list is allowed to be read by anyone
    // permission to check does user has access
    await permissionService.getProjectPermission(actor, actorId, projectId);

    const env = await projectEnvDal.findOne({ projectId, slug: environment });
    if (!env)
      throw new BadRequestError({ message: "Environment not found", name: "Create folder" });

    const folders = await folderDal.find({ envId: env.id, parentId: null });
    return folders.filter(({ name }) => name !== ROOT_FOLDER_NAME);
  };

  return {
    createFolder,
    updateFolder,
    deleteFolder,
    getFolders
  };
};
