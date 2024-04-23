import { ForbiddenError, subject } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError } from "@app/lib/errors";

import { TProjectDALFactory } from "../project/project-dal";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretImportDALFactory } from "./secret-import-dal";
import { fnSecretsFromImports } from "./secret-import-fns";
import {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TGetSecretImportsDTO,
  TGetSecretsFromImportDTO,
  TUpdateSecretImportDTO
} from "./secret-import-types";

type TSecretImportServiceFactoryDep = {
  secretImportDAL: TSecretImportDALFactory;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: Pick<TSecretDALFactory, "find">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus">;
  projectEnvDAL: TProjectEnvDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
};

const ERR_SEC_IMP_NOT_FOUND = new BadRequestError({ message: "Secret import not found" });

export type TSecretImportServiceFactory = ReturnType<typeof secretImportServiceFactory>;

export const secretImportServiceFactory = ({
  secretImportDAL,
  projectEnvDAL,
  permissionService,
  folderDAL,
  projectDAL,
  secretDAL,
  secretQueueService
}: TSecretImportServiceFactoryDep) => {
  const createImport = async ({
    environment,
    data,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    path
  }: TCreateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

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

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Create import" });

    const [importEnv] = await projectEnvDAL.findBySlugs(projectId, [data.environment]);
    if (!importEnv) throw new BadRequestError({ error: "Imported env not found", name: "Create import" });

    const sourceFolder = await folderDAL.findBySecretPath(projectId, data.environment, data.path);
    if (sourceFolder) {
      const existingImport = await secretImportDAL.findOne({
        folderId: sourceFolder.id,
        importEnv: folder.environment.id,
        importPath: path
      });
      if (existingImport) throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const lastPos = await secretImportDAL.findLastImportPosition(folder.id, tx);
      return secretImportDAL.create(
        {
          folderId: folder.id,
          position: lastPos + 1,
          importEnv: importEnv.id,
          importPath: data.path
        },
        tx
      );
    });

    await secretQueueService.syncSecrets({
      secretPath: secImport.importPath,
      projectId,
      environment: importEnv.slug
    });

    return { ...secImport, importEnv };
  };

  const updateImport = async ({
    path,
    environment,
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    data,
    id
  }: TUpdateSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Edit,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Update import" });

    const secImpDoc = await secretImportDAL.findOne({ folderId: folder.id, id });
    if (!secImpDoc) throw ERR_SEC_IMP_NOT_FOUND;

    const importedEnv = data.environment // this is get env information of new one or old one
      ? (await projectEnvDAL.findBySlugs(projectId, [data.environment]))?.[0]
      : await projectEnvDAL.findById(secImpDoc.importEnv);
    if (!importedEnv) throw new BadRequestError({ error: "Imported env not found", name: "Create import" });

    const sourceFolder = await folderDAL.findBySecretPath(
      projectId,
      importedEnv.slug,
      data.path || secImpDoc.importPath
    );
    if (sourceFolder) {
      const existingImport = await secretImportDAL.findOne({
        folderId: sourceFolder.id,
        importEnv: folder.environment.id,
        importPath: path
      });
      if (existingImport) throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const updatedSecImport = await secretImportDAL.transaction(async (tx) => {
      const secImp = await secretImportDAL.findOne({ folderId: folder.id, id });
      if (!secImp) throw ERR_SEC_IMP_NOT_FOUND;
      if (data.position) {
        await secretImportDAL.updateAllPosition(folder.id, secImp.position, data.position, tx);
      }
      const [doc] = await secretImportDAL.update(
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
    actorOrgId,
    actorAuthMethod,
    id
  }: TDeleteSecretImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Delete import" });

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const [doc] = await secretImportDAL.delete({ folderId: folder.id, id }, tx);
      if (!doc) throw new BadRequestError({ name: "Sec imp del", message: "Secret import doc not found" });
      await secretImportDAL.updateAllPosition(folder.id, doc.position, -1, tx);

      const importEnv = await projectEnvDAL.findById(doc.importEnv);
      if (!importEnv) throw new BadRequestError({ error: "Imported env not found", name: "Create import" });
      return { ...doc, importEnv };
    });

    await secretQueueService.syncSecrets({
      secretPath: path,
      projectId,
      environment
    });

    return secImport;
  };

  const getImports = async ({
    path,
    environment,
    projectId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetSecretImportsDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Get imports" });

    const secImports = await secretImportDAL.find({ folderId: folder.id });
    return secImports;
  };

  const getSecretsFromImports = async ({
    path,
    environment,
    projectId,
    actor,
    actorAuthMethod,
    actorId,
    actorOrgId
  }: TGetSecretsFromImportDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Read,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath: path })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, path);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = await secretImportDAL.find({ folderId: folder.id });

    const allowedImports = secretImports.filter(({ importEnv, importPath }) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: importEnv.slug,
          secretPath: importPath
        })
      )
    );
    return fnSecretsFromImports({ allowedImports, folderDAL, secretDAL });
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
