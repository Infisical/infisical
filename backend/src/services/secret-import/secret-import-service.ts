import path from "node:path";

import { ForbiddenError, subject } from "@casl/ability";

import { TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getReplicationFolderName } from "@app/ee/services/secret-replication/secret-replication-service";
import { BadRequestError } from "@app/lib/errors";

import { TKmsServiceFactory } from "../kms/kms-service";
import { KmsDataKey } from "../kms/kms-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "../project-env/project-env-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { decryptSecretRaw } from "../secret/secret-fns";
import { TSecretQueueFactory } from "../secret/secret-queue";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretImportDALFactory } from "./secret-import-dal";
import { fnSecretsFromImports, fnSecretsV2FromImports } from "./secret-import-fns";
import {
  TCreateSecretImportDTO,
  TDeleteSecretImportDTO,
  TGetSecretImportsDTO,
  TGetSecretsFromImportDTO,
  TResyncSecretImportReplicationDTO,
  TUpdateSecretImportDTO
} from "./secret-import-types";

type TSecretImportServiceFactoryDep = {
  secretImportDAL: TSecretImportDALFactory;
  folderDAL: TSecretFolderDALFactory;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus">;
  projectEnvDAL: TProjectEnvDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets" | "replicateSecrets">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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
  secretQueueService,
  licenseService,
  projectBotService,
  secretV2BridgeDAL,
  kmsService
}: TSecretImportServiceFactoryDep) => {
  const createImport = async ({
    environment,
    data,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    isReplication,
    path: secretPath
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    // check if user has permission to import from target path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment: data.environment,
        secretPath: data.path
      })
    );
    if (isReplication) {
      const plan = await licenseService.getPlan(actorOrgId);
      if (!plan.secretApproval) {
        throw new BadRequestError({
          message: "Failed to create secret replication due to plan restriction. Upgrade plan to create replication."
        });
      }
    }

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Create import" });

    const [importEnv] = await projectEnvDAL.findBySlugs(projectId, [data.environment]);
    if (!importEnv) throw new BadRequestError({ error: "Imported env not found", name: "Create import" });

    const sourceFolder = await folderDAL.findBySecretPath(projectId, data.environment, data.path);
    if (sourceFolder) {
      const existingImport = await secretImportDAL.findOne({
        folderId: sourceFolder.id,
        importEnv: folder.environment.id,
        importPath: secretPath
      });
      if (existingImport) throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const lastPos = await secretImportDAL.findLastImportPosition(folder.id, tx);
      const doc = await secretImportDAL.create(
        {
          folderId: folder.id,
          position: lastPos + 1,
          importEnv: importEnv.id,
          importPath: data.path,
          isReplication
        },
        tx
      );
      if (doc.isReplication) {
        await secretImportDAL.create(
          {
            folderId: folder.id,
            position: lastPos + 2,
            isReserved: true,
            importEnv: folder.environment.id,
            importPath: path.join(secretPath, getReplicationFolderName(doc.id))
          },
          tx
        );
      }
      return doc;
    });

    if (secImport.isReplication && sourceFolder) {
      await secretQueueService.replicateSecrets({
        secretPath: secImport.importPath,
        projectId,
        environmentSlug: importEnv.slug,
        pickOnlyImportIds: [secImport.id],
        actorId,
        actor
      });
    } else {
      await secretQueueService.syncSecrets({
        secretPath,
        projectId,
        environmentSlug: environment,
        actorId,
        actor
      });
    }

    return { ...secImport, importEnv };
  };

  const updateImport = async ({
    path: secretPath,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
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
        importPath: secretPath
      });
      if (existingImport) throw new BadRequestError({ message: "Cyclic import not allowed" });
    }

    const updatedSecImport = await secretImportDAL.transaction(async (tx) => {
      const secImp = await secretImportDAL.findOne({ folderId: folder.id, id });
      if (!secImp) throw ERR_SEC_IMP_NOT_FOUND;
      if (data.position) {
        if (secImp.isReplication) {
          await secretImportDAL.updateAllPosition(folder.id, secImp.position, data.position, 2, tx);
        } else {
          await secretImportDAL.updateAllPosition(folder.id, secImp.position, data.position, 1, tx);
        }
      }
      if (secImp.isReplication) {
        const replicationFolderPath = path.join(secretPath, getReplicationFolderName(secImp.id));
        await secretImportDAL.update(
          {
            folderId: folder.id,
            importEnv: folder.environment.id,
            importPath: replicationFolderPath,
            isReserved: true
          },
          { position: data?.position ? data.position + 1 : undefined },
          tx
        );
      }
      const [doc] = await secretImportDAL.update(
        { id, folderId: folder.id },
        {
          // when moving replicated import, the position is meant for reserved import
          // replicated one should always be behind the reserved import
          position: data.position,
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
    path: secretPath,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Delete import" });

    const secImport = await secretImportDAL.transaction(async (tx) => {
      const [doc] = await secretImportDAL.delete({ folderId: folder.id, id }, tx);
      if (!doc) throw new BadRequestError({ name: "Sec imp del", message: "Secret import doc not found" });
      if (doc.isReplication) {
        const replicationFolderPath = path.join(secretPath, getReplicationFolderName(doc.id));
        const replicatedFolder = await folderDAL.findBySecretPath(projectId, environment, replicationFolderPath, tx);
        if (replicatedFolder) {
          await secretImportDAL.delete(
            {
              folderId: folder.id,
              importEnv: folder.environment.id,
              importPath: replicationFolderPath,
              isReserved: true
            },
            tx
          );
          await folderDAL.deleteById(replicatedFolder.id, tx);
        }
        await secretImportDAL.updateAllPosition(folder.id, doc.position, -1, 2, tx);
      } else {
        await secretImportDAL.updateAllPosition(folder.id, doc.position, -1, 1, tx);
      }

      const importEnv = await projectEnvDAL.findById(doc.importEnv);
      if (!importEnv) throw new BadRequestError({ error: "Imported env not found", name: "Create import" });
      return { ...doc, importEnv };
    });

    await secretQueueService.syncSecrets({
      secretPath,
      projectId,
      environmentSlug: environment,
      actor,
      actorId
    });

    return secImport;
  };

  const resyncSecretImportReplication = async ({
    environment,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    path: secretPath,
    id: secretImportDocId
  }: TResyncSecretImportReplicationDTO) => {
    const { permission, membership } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    // check if user has permission to import into destination  path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.secretApproval) {
      throw new BadRequestError({
        message: "Failed to create secret replication due to plan restriction. Upgrade plan to create replication."
      });
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Update import" });

    const [secretImportDoc] = await secretImportDAL.find({
      folderId: folder.id,
      [`${TableName.SecretImport}.id` as "id"]: secretImportDocId
    });
    if (!secretImportDoc) throw new BadRequestError({ message: "Failed to find secret import" });

    if (!secretImportDoc.isReplication) throw new BadRequestError({ message: "Import is not in replication mode" });

    // check if user has permission to import from target path
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      subject(ProjectPermissionSub.Secrets, {
        environment: secretImportDoc.importEnv.slug,
        secretPath: secretImportDoc.importPath
      })
    );

    await projectDAL.checkProjectUpgradeStatus(projectId);

    const sourceFolder = await folderDAL.findBySecretPath(
      projectId,
      secretImportDoc.importEnv.slug,
      secretImportDoc.importPath
    );

    if (membership && sourceFolder) {
      await secretQueueService.replicateSecrets({
        secretPath: secretImportDoc.importPath,
        projectId,
        environmentSlug: secretImportDoc.importEnv.slug,
        pickOnlyImportIds: [secretImportDoc.id],
        actorId,
        actor
      });
    }

    return { message: "replication started" };
  };

  const getImports = async ({
    path: secretPath,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) throw new BadRequestError({ message: "Folder not found", name: "Get imports" });

    const secImports = await secretImportDAL.find({ folderId: folder.id });
    return secImports;
  };

  const getSecretsFromImports = async ({
    path: secretPath,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = await secretImportDAL.find({ folderId: folder.id, isReplication: false });

    const allowedImports = secretImports.filter(({ importEnv, importPath }) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: importEnv.slug,
          secretPath: importPath
        })
      )
    );
    return fnSecretsFromImports({ allowedImports, folderDAL, secretDAL, secretImportDAL });
  };

  const getRawSecretsFromImports = async ({
    path: secretPath,
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
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );
    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];
    // this will already order by position
    // so anything based on this order will also be in right position
    const secretImports = await secretImportDAL.find({ folderId: folder.id, isReplication: false });

    const allowedImports = secretImports.filter(({ importEnv, importPath }) =>
      permission.can(
        ProjectPermissionActions.Read,
        subject(ProjectPermissionSub.Secrets, {
          environment: importEnv.slug,
          secretPath: importPath
        })
      )
    );

    const { botKey, shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);
    if (shouldUseSecretV2Bridge) {
      const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
        type: KmsDataKey.SecretManager,
        projectId
      });
      const importedSecrets = await fnSecretsV2FromImports({
        allowedImports,
        folderDAL,
        secretDAL: secretV2BridgeDAL,
        secretImportDAL,
        decryptor: (value) => (value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "")
      });
      return importedSecrets;
    }

    if (!botKey)
      throw new BadRequestError({
        message: "Project bot not found. Please upgrade your project.",
        name: "bot_not_found_error"
      });

    const importedSecrets = await fnSecretsFromImports({ allowedImports, folderDAL, secretDAL, secretImportDAL });
    return importedSecrets.map((el) => ({
      ...el,
      secrets: el.secrets.map((encryptedSecret) =>
        decryptSecretRaw({ ...encryptedSecret, workspace: projectId, environment, secretPath }, botKey)
      )
    }));
  };

  return {
    createImport,
    updateImport,
    deleteImport,
    getImports,
    getSecretsFromImports,
    getRawSecretsFromImports,
    resyncSecretImportReplication,
    fnSecretsFromImports
  };
};
