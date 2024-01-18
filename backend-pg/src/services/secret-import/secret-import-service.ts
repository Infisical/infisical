import { ForbiddenError, subject } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectEnvDalFactory } from "../project-env/project-env-dal";
import { TSecretDalFactory } from "../secret/secret-dal";
import { TSecretFolderDalFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDalFactory } from "./secret-import-dal";
import { fnSecretsFromImports } from "./secret-import-fns";
import {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TGetSecretImportsDTO,
  TGetSecretsFromImportDTO,
  TUpdateSecretImportDTO
} from "./secret-import-types";

type TSecretImportServiceFactoryDep = {
  secretImportDal: TSecretImportDalFactory;
  folderDal: TSecretFolderDalFactory;
  secretDal: Pick<TSecretDalFactory, "find">;
  projectEnvDal: TProjectEnvDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

const ERR_SEC_IMP_NOT_FOUND = new BadRequestError({ message: "Secret import not found" });

export type TSecretImportServiceFactory = ReturnType<typeof secretImportServiceFactory>;

export const secretImportServiceFactory = ({
  secretImportDal,
  projectEnvDal,
  permissionService,
  folderDal,
  secretDal
}: TSecretImportServiceFactoryDep) => {
  const createImport = async ({
    environment,
    data,
    actor,
    actorId,
    projectId,
    path
  }: TCreateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);

    // check if user has permission to import into destination  path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    // check if user has permission to import from target path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment: data.environment,
        secretPath: data.path
      })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Create import" });

    // TODO(akhilmhdh-pg): updated permission check add here
    const [importEnv] = await projectEnvDal.findBySlugs(projectId, [data.environment]);
    if (!importEnv)
      throw new BadRequestError({ error: "Imported env not found", name: "Create import" });

    const secImport = await secretImportDal.transaction(async (tx) => {
      const lastPos = await secretImportDal.findLastImportPosition(folder.id, tx);
      return secretImportDal.create(
        {
          folderId: folder.id,
          position: lastPos + 1,
          importEnv: importEnv.id,
          importPath: data.path
        },
        tx
      );
    });

    return { ...secImport, importEnv };
  };

  const updateImport = async ({
    path,
    environment,
    projectId,
    actor,
    actorId,
    data,
    id
  }: TUpdateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Update import" });

    const secImpDoc = await secretImportDal.findOne({ folderId: folder.id, id });
    if (!secImpDoc) throw ERR_SEC_IMP_NOT_FOUND;

    const importedEnv = data.environment // this is get env information of new one or old one
      ? (await projectEnvDal.findBySlugs(projectId, [data.environment]))?.[0]
      : await projectEnvDal.findById(secImpDoc.importEnv);
    if (!importedEnv)
      throw new BadRequestError({ error: "Imported env not found", name: "Create import" });

    const updatedSecImport = await secretImportDal.transaction(async (tx) => {
      const secImp = await secretImportDal.findOne({ folderId: folder.id, id });
      if (!secImp) throw ERR_SEC_IMP_NOT_FOUND;
      if (data.position) {
        await secretImportDal.updateAllPosition(folder.id, secImp.position, data.position, tx);
      }
      const [doc] = await secretImportDal.update(
        { id, folderId: folder.id },
        {
          position: data?.position,
          importEnv: data?.environment ? importedEnv.id : undefined,
          importPath: data?.path
        },
        tx
      );
      return doc;
    });
    return { ...updatedSecImport, importEnv: importedEnv };
  };

  const deleteImport = async ({
    path,
    environment,
    projectId,
    actor,
    actorId,
    id
  }: TDeleteSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Delete import" });

    const secImport = await secretImportDal.transaction(async (tx) => {
      const [doc] = await secretImportDal.delete({ folderId: folder.id, id }, tx);
      if (!doc)
        throw new BadRequestError({ name: "Sec imp del", message: "Secret import doc not found" });
      await secretImportDal.updateAllPosition(folder.id, doc.position, -1, tx);

      const importEnv = await projectEnvDal.findById(doc.importEnv);
      if (!importEnv)
        throw new BadRequestError({ error: "Imported env not found", name: "Create import" });
      return { ...doc, importEnv };
    });
    return secImport;
  };

  const getImports = async ({
    path,
    environment,
    projectId,
    actor,
    actorId
  }: TGetSecretImportsDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Get imports" });

    const secImports = await secretImportDal.find({ folderId: folder.id });
    return secImports;
  };

  const getSecretsFromImports = async ({
    path,
    environment,
    projectId,
    actor,
    actorId
  }: TGetSecretsFromImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(actor, actorId, projectId);
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );
    const folder = await folderDal.findBySecretPath(projectId, environment, path);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = await secretImportDal.find({ folderId: folder.id });

    const allowedImports = secretImports.filter(({ importEnv, importPath }) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: importEnv.slug,
          secretPath: importPath
        })
      )
    );
    return fnSecretsFromImports({ allowedImports, folderDal, secretDal });
  };

  return {
    createImport,
    updateImport,
    deleteImport,
    getImports,
    getSecretsFromImports,
    fnSecretsFromImports
  };
};
