import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretRotationActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { listSecretRotationOptions } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-fns";
import { SECRET_ROTATION_CONNECTION_MAP } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-maps";
import {
  TCreateSecretRotationV2DTO,
  TListSecretRotationsV2ByProjectId,
  TSecretRotationV2
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";

import { TSecretRotationV2DALFactory } from "./secret-rotation-v2-dal";

type TSecretRotationV2ServiceFactoryDep = {
  secretRotationV2DAL: TSecretRotationV2DALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId" | "findById" | "findBySecretPath">;
  // keyStore: Pick<TKeyStoreFactory, "getItem">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretRotationV2ServiceFactory = ReturnType<typeof secretRotationV2ServiceFactory>;

export const secretRotationV2ServiceFactory = ({
  secretRotationV2DAL,
  folderDAL,
  permissionService,
  appConnectionService,
  projectBotService,
  licenseService
}: TSecretRotationV2ServiceFactoryDep) => {
  const listSecretRotationsByProjectId = async (
    { projectId, type }: TListSecretRotationsV2ByProjectId,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to access secret rotations due to plan restriction. Upgrade plan to access secret rotations."
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Read,
      ProjectPermissionSub.SecretRotation
    );

    const secretRotations = await secretRotationV2DAL.find({
      ...(type && { type }),
      projectId
    });

    return secretRotations as TSecretRotationV2[];
  };

  // const findSecretRotationById = async (
  //   { destination, syncId }: TFindSecretRotationV2ByIdDTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.Read,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   return secretSync as TSecretRotation;
  // };
  //
  // const findSecretRotationByName = async (
  //   { destination, syncName, projectId }: TFindSecretRotationV2ByNameDTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const folders = await folderDAL.findByProjectId(projectId);
  //
  //   // we prevent conflicting names within a project so this will only return one at most
  //   const [secretSync] = await secretSyncDAL.find({
  //     name: syncName,
  //     $in: {
  //       folderId: folders.map((folder) => folder.id)
  //     }
  //   });
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with name "${syncName}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.Read,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   return secretSync as TSecretRotation;
  // };
  //
  const createSecretRotation = async (
    { projectId, secretPath, environment, ...params }: TCreateSecretRotationV2DTO,
    actor: OrgServiceActor
  ) => {
    const plan = await licenseService.getPlan(actor.orgId);

    if (!plan.secretRotation)
      throw new BadRequestError({
        message: "Failed to create secret rotation due to plan restriction. Upgrade plan to create secret rotations."
      });

    const { permission: projectPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({ message: "Project version does not support Secret Rotation V2" });

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionSecretRotationActions.Create,
      ProjectPermissionSub.SecretRotation
    );

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionSecretActions.Create,
      subject(ProjectPermissionSub.Secrets, { environment, secretPath })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    const destinationApp = SECRET_ROTATION_CONNECTION_MAP[params.type];

    // validates permission to connect and app is valid for sync destination
    await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);

    // TODO: initialize credentials

    try {
      const secretRotation = await secretRotationV2DAL.create({
        folderId: folder.id,
        ...params,
        encryptedGeneratedCredentials: Buffer.from([]),
        projectId
      });

      return secretRotation as TSecretRotationV2;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Rotation with the name "${params.name}" already exists for the project with ID "${folder.projectId}"`
        });
      }

      throw err;
    }
  };
  //
  // const updateSecretRotation = async (
  //   { destination, syncId, secretPath, environment, ...params }: TUpdateSecretRotationV2DTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID ${syncId}`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.Edit,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   let { folderId } = secretSync;
  //
  //   if (params.connectionId) {
  //     const destinationApp = SECRET_SYNC_CONNECTION_MAP[secretSync.destination as SecretRotation];
  //
  //     // validates permission to connect and app is valid for sync destination
  //     await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);
  //   }
  //
  //   if (
  //     (secretPath && secretPath !== secretSync.folder?.path) ||
  //     (environment && environment !== secretSync.environment?.slug)
  //   ) {
  //     const updatedEnvironment = environment ?? secretSync.environment?.slug;
  //     const updatedSecretPath = secretPath ?? secretSync.folder?.path;
  //
  //     if (!updatedEnvironment || !updatedSecretPath)
  //       throw new BadRequestError({ message: "Must specify both source environment and secret path" });
  //
  //     throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.ReadValue, {
  //       environment: updatedEnvironment,
  //       secretPath: updatedSecretPath
  //     });
  //
  //     const newFolder = await folderDAL.findBySecretPath(secretSync.projectId, updatedEnvironment, updatedSecretPath);
  //
  //     if (!newFolder)
  //       throw new BadRequestError({
  //         message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${secretSync.projectId}"`
  //       });
  //
  //     folderId = newFolder.id;
  //   }
  //
  //   const isAutoSyncEnabled = params.isAutoSyncEnabled ?? secretSync.isAutoSyncEnabled;
  //
  //   try {
  //     const updatedSecretRotation = await secretSyncDAL.updateById(syncId, {
  //       ...params,
  //       ...(isAutoSyncEnabled && folderId && { syncStatus: SecretRotationStatus.Pending }),
  //       folderId
  //     });
  //
  //     if (updatedSecretRotation.isAutoSyncEnabled)
  //       await secretSyncQueue.queueSecretRotationSyncSecretsById({ syncId: secretSync.id });
  //
  //     return updatedSecretRotation as TSecretRotation;
  //   } catch (err) {
  //     if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
  //       throw new BadRequestError({
  //         message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${secretSync.projectId}"`
  //       });
  //     }
  //
  //     throw err;
  //   }
  // };
  //
  // const deleteSecretRotation = async (
  //   { destination, syncId, removeSecrets }: TDeleteSecretRotationV2DTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.Delete,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   if (removeSecrets) {
  //     ForbiddenError.from(permission).throwUnlessCan(
  //       ProjectPermissionSecretRotationActions.RemoveSecrets,
  //       ProjectPermissionSub.SecretRotations
  //     );
  //
  //     if (!secretSync.folderId)
  //       throw new BadRequestError({
  //         message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
  //       });
  //
  //     const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretRotationLock(syncId)));
  //
  //     if (isSyncJobRunning)
  //       throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });
  //
  //     await secretSyncQueue.queueSecretRotationRemoveSecretsById({ syncId, deleteSyncOnComplete: true });
  //
  //     const updatedSecretRotation = await secretSyncDAL.updateById(syncId, {
  //       removeStatus: SecretRotationStatus.Pending
  //     });
  //
  //     return updatedSecretRotation;
  //   }
  //
  //   await secretSyncDAL.deleteById(syncId);
  //
  //   return secretSync as TSecretRotation;
  // };
  //
  // const triggerSecretRotationSyncSecretsById = async (
  //   { syncId, destination, ...params }: TTriggerSecretRotationSyncSecretsByIdDTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.SyncSecrets,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   if (!secretSync.folderId)
  //     throw new BadRequestError({
  //       message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
  //     });
  //
  //   const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretRotationLock(syncId)));
  //
  //   if (isSyncJobRunning)
  //     throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });
  //
  //   await secretSyncQueue.queueSecretRotationSyncSecretsById({ syncId, ...params });
  //
  //   const updatedSecretRotation = await secretSyncDAL.updateById(syncId, {
  //     syncStatus: SecretRotationStatus.Pending
  //   });
  //
  //   return updatedSecretRotation as TSecretRotation;
  // };
  //
  // const triggerSecretRotationImportSecretsById = async (
  //   { syncId, destination, ...params }: TTriggerSecretRotationImportSecretsByIdDTO,
  //   actor: OrgServiceActor
  // ) => {
  //   if (!listSecretRotationOptions().find((option) => option.destination === destination)?.canImportSecrets) {
  //     throw new BadRequestError({
  //       message: `${SECRET_SYNC_NAME_MAP[destination]} does not support importing secrets.`
  //     });
  //   }
  //
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.ImportSecrets,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   if (!secretSync.folderId)
  //     throw new BadRequestError({
  //       message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
  //     });
  //
  //   const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretRotationLock(syncId)));
  //
  //   if (isSyncJobRunning)
  //     throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });
  //
  //   await secretSyncQueue.queueSecretRotationImportSecretsById({ syncId, ...params });
  //
  //   const updatedSecretRotation = await secretSyncDAL.updateById(syncId, {
  //     importStatus: SecretRotationStatus.Pending
  //   });
  //
  //   return updatedSecretRotation as TSecretRotation;
  // };
  //
  // const triggerSecretRotationRemoveSecretsById = async (
  //   { syncId, destination, ...params }: TTriggerSecretRotationRemoveSecretsByIdDTO,
  //   actor: OrgServiceActor
  // ) => {
  //   const secretSync = await secretSyncDAL.findById(syncId);
  //
  //   if (!secretSync)
  //     throw new NotFoundError({
  //       message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
  //     });
  //
  //   const { permission } = await permissionService.getProjectPermission({
  //     actor: actor.type,
  //     actorId: actor.id,
  //     actorAuthMethod: actor.authMethod,
  //     actorOrgId: actor.orgId,
  //     actionProjectType: ActionProjectType.SecretManager,
  //     projectId: secretSync.projectId
  //   });
  //
  //   ForbiddenError.from(permission).throwUnlessCan(
  //     ProjectPermissionSecretRotationActions.RemoveSecrets,
  //     ProjectPermissionSub.SecretRotations
  //   );
  //
  //   if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
  //     throw new BadRequestError({
  //       message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
  //     });
  //
  //   if (!secretSync.folderId)
  //     throw new BadRequestError({
  //       message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
  //     });
  //
  //   const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretRotationLock(syncId)));
  //
  //   if (isSyncJobRunning)
  //     throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });
  //
  //   await secretSyncQueue.queueSecretRotationRemoveSecretsById({ syncId, ...params });
  //
  //   const updatedSecretRotation = await secretSyncDAL.updateById(syncId, {
  //     removeStatus: SecretRotationStatus.Pending
  //   });
  //
  //   return updatedSecretRotation as TSecretRotation;
  // };

  return {
    listSecretRotationOptions,
    listSecretRotationsByProjectId,
    createSecretRotation
    // findSecretRotationById,
    // findSecretRotationByName,
    // createSecretRotation,
    // updateSecretRotation,
    // deleteSecretRotation,
    // triggerSecretRotationSyncSecretsById,
    // triggerSecretRotationImportSecretsById,
    // triggerSecretRotationRemoveSecretsById
  };
};
