import { ForbiddenError, subject } from "@casl/ability";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { throwIfMissingSecretReadValueOrDescribePermission } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionSecretActions,
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { enterpriseSyncCheck, listSecretSyncOptions } from "@app/services/secret-sync/secret-sync-fns";
import {
  SecretSyncStatus,
  TCreateSecretSyncDTO,
  TDeleteSecretSyncDTO,
  TFindSecretSyncByIdDTO,
  TFindSecretSyncByNameDTO,
  TListSecretSyncsByFolderId,
  TListSecretSyncsByProjectId,
  TSecretSync,
  TTriggerSecretSyncImportSecretsByIdDTO,
  TTriggerSecretSyncRemoveSecretsByIdDTO,
  TTriggerSecretSyncSyncSecretsByIdDTO,
  TUpdateSecretSyncDTO
} from "@app/services/secret-sync/secret-sync-types";

import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretSyncDALFactory } from "./secret-sync-dal";
import { SECRET_SYNC_CONNECTION_MAP, SECRET_SYNC_NAME_MAP } from "./secret-sync-maps";
import { TSecretSyncQueueFactory } from "./secret-sync-queue";

type TSecretSyncServiceFactoryDep = {
  secretSyncDAL: TSecretSyncDALFactory;
  secretImportDAL: TSecretImportDALFactory;
  appConnectionService: Pick<TAppConnectionServiceFactory, "connectAppConnectionById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId" | "findById" | "findBySecretPath">;
  keyStore: Pick<TKeyStoreFactory, "getItem">;
  secretSyncQueue: Pick<
    TSecretSyncQueueFactory,
    "queueSecretSyncSyncSecretsById" | "queueSecretSyncImportSecretsById" | "queueSecretSyncRemoveSecretsById"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TSecretSyncServiceFactory = ReturnType<typeof secretSyncServiceFactory>;

export const secretSyncServiceFactory = ({
  secretSyncDAL,
  folderDAL,
  secretImportDAL,
  permissionService,
  appConnectionService,
  projectBotService,
  secretSyncQueue,
  keyStore,
  licenseService
}: TSecretSyncServiceFactoryDep) => {
  const listSecretSyncsByProjectId = async (
    { projectId, destination }: TListSecretSyncsByProjectId,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSub.SecretSyncs
    );

    const secretSyncs = await secretSyncDAL.find({
      ...(destination && { destination }),
      projectId
    });

    return secretSyncs.filter((secretSync) =>
      permission.can(
        ProjectPermissionSecretSyncActions.Read,
        secretSync.environment && secretSync.folder
          ? subject(ProjectPermissionSub.SecretSyncs, {
              environment: secretSync.environment.slug,
              secretPath: secretSync.folder.path
            })
          : ProjectPermissionSub.SecretSyncs
      )
    ) as TSecretSync[];
  };

  const listSecretSyncsBySecretPath = async (
    { projectId, secretPath, environment }: TListSecretSyncsByFolderId,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId
    });

    if (
      permission.cannot(
        ProjectPermissionSecretSyncActions.Read,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment,
          secretPath
        })
      )
    ) {
      return [];
    }

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);
    if (!folder) return [];

    const folderImports = await secretImportDAL.getFolderImports(secretPath, folder.envId);

    const secretSyncs = await secretSyncDAL.find({
      $in: {
        folderId: folderImports.map((folderImport) => folderImport.folderId).concat(folder.id)
      }
    });

    return secretSyncs as TSecretSync[];
  };

  const findSecretSyncById = async ({ destination, syncId }: TFindSecretSyncByIdDTO, actor: OrgServiceActor) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      secretSync.environment && secretSync.folder
        ? subject(ProjectPermissionSub.SecretSyncs, {
            environment: secretSync.environment.slug,
            secretPath: secretSync.folder.path
          })
        : ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const findSecretSyncByName = async (
    { destination, syncName, projectId }: TFindSecretSyncByNameDTO,
    actor: OrgServiceActor
  ) => {
    // we prevent conflicting names within a project
    const secretSync = await secretSyncDAL.findOne({
      name: syncName,
      projectId
    });

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with name "${syncName}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      secretSync.environment && secretSync.folder
        ? subject(ProjectPermissionSub.SecretSyncs, {
            environment: secretSync.environment.slug,
            secretPath: secretSync.folder.path
          })
        : ProjectPermissionSub.SecretSyncs
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const createSecretSync = async (
    { projectId, secretPath, environment, ...params }: TCreateSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    await enterpriseSyncCheck(
      licenseService,
      params.destination,
      actor.orgId,
      "Failed to create secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    const { permission: projectPermission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId
    });

    const { shouldUseSecretV2Bridge } = await projectBotService.getBotKey(projectId);

    if (!shouldUseSecretV2Bridge)
      throw new BadRequestError({ message: "Project version does not support Secret Syncs" });

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Create,
      subject(ProjectPermissionSub.SecretSyncs, { environment, secretPath })
    );

    throwIfMissingSecretReadValueOrDescribePermission(
      projectPermission,
      ProjectPermissionSecretActions.DescribeSecret,
      {
        environment,
        secretPath
      }
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    const destinationApp = SECRET_SYNC_CONNECTION_MAP[params.destination];

    // validates permission to connect and app is valid for sync destination
    await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);

    try {
      const secretSync = await secretSyncDAL.create({
        folderId: folder.id,
        ...params,
        ...(params.isAutoSyncEnabled && { syncStatus: SecretSyncStatus.Pending }),
        projectId
      });

      if (secretSync.isAutoSyncEnabled) await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId: secretSync.id });

      return secretSync as TSecretSync;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${folder.projectId}"`
        });
      }

      throw err;
    }
  };

  const updateSecretSync = async (
    { destination, syncId, secretPath, environment, ...params }: TUpdateSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID ${syncId}`
      });

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      actor.orgId,
      "Failed to update secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    // we always check the permission against the existing environment / secret path
    // if no secret path / environment is present on the secret sync, we need to check without conditions
    if (secretSync.environment?.slug && secretSync.folder?.path) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.Edit,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment: secretSync.environment.slug,
          secretPath: secretSync.folder.path
        })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.Edit,
        ProjectPermissionSub.SecretSyncs
      );
    }

    // if the user is updating the secret path or environment, we need to check the permission against the new values
    if (secretPath || environment) {
      const environmentToCheck = environment || secretSync.environment?.slug || "";
      const secretPathToCheck = secretPath || secretSync.folder?.path || "";

      if (environmentToCheck && secretPathToCheck) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionSecretSyncActions.Edit,
          subject(ProjectPermissionSub.SecretSyncs, {
            environment: environmentToCheck,
            secretPath: secretPathToCheck
          })
        );
      }
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    let { folderId } = secretSync;

    if (params.connectionId) {
      const destinationApp = SECRET_SYNC_CONNECTION_MAP[secretSync.destination as SecretSync];

      // validates permission to connect and app is valid for sync destination
      await appConnectionService.connectAppConnectionById(destinationApp, params.connectionId, actor);
    }

    if (
      (secretPath && secretPath !== secretSync.folder?.path) ||
      (environment && environment !== secretSync.environment?.slug)
    ) {
      const updatedEnvironment = environment ?? secretSync.environment?.slug;
      const updatedSecretPath = secretPath ?? secretSync.folder?.path;

      if (!updatedEnvironment || !updatedSecretPath)
        throw new BadRequestError({ message: "Must specify both source environment and secret path" });

      throwIfMissingSecretReadValueOrDescribePermission(permission, ProjectPermissionSecretActions.DescribeSecret, {
        environment: updatedEnvironment,
        secretPath: updatedSecretPath
      });

      const newFolder = await folderDAL.findBySecretPath(secretSync.projectId, updatedEnvironment, updatedSecretPath);

      if (!newFolder)
        throw new BadRequestError({
          message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${secretSync.projectId}"`
        });

      folderId = newFolder.id;
    }

    const isAutoSyncEnabled = params.isAutoSyncEnabled ?? secretSync.isAutoSyncEnabled;

    try {
      const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
        ...params,
        ...(isAutoSyncEnabled && folderId && { syncStatus: SecretSyncStatus.Pending }),
        folderId
      });

      if (updatedSecretSync.isAutoSyncEnabled)
        await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId: secretSync.id });

      return updatedSecretSync as TSecretSync;
    } catch (err) {
      if (err instanceof DatabaseError && (err.error as { code: string })?.code === DatabaseErrorCode.UniqueViolation) {
        throw new BadRequestError({
          message: `A Secret Sync with the name "${params.name}" already exists for the project with ID "${secretSync.projectId}"`
        });
      }

      throw err;
    }
  };

  const deleteSecretSync = async (
    { destination, syncId, removeSecrets }: TDeleteSecretSyncDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    if (secretSync.environment?.slug && secretSync.folder?.path) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.Delete,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment: secretSync.environment.slug,
          secretPath: secretSync.folder.path
        })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.Delete,
        ProjectPermissionSub.SecretSyncs
      );
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (removeSecrets) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.RemoveSecrets,
        ProjectPermissionSub.SecretSyncs
      );

      if (!secretSync.folderId)
        throw new BadRequestError({
          message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
        });

      const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

      if (isSyncJobRunning)
        throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

      await secretSyncQueue.queueSecretSyncRemoveSecretsById({ syncId, deleteSyncOnComplete: true });

      const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
        removeStatus: SecretSyncStatus.Pending
      });

      return updatedSecretSync;
    }

    await secretSyncDAL.deleteById(syncId);

    return secretSync as TSecretSync;
  };

  const triggerSecretSyncSyncSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncSyncSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      actor.orgId,
      "Failed to trigger secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    if (secretSync.environment?.slug && secretSync.folder?.path) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.SyncSecrets,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment: secretSync.environment.slug,
          secretPath: secretSync.folder.path
        })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.SyncSecrets,
        ProjectPermissionSub.SecretSyncs
      );
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncSyncSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      syncStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  const triggerSecretSyncImportSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncImportSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    if (!listSecretSyncOptions().find((option) => option.destination === destination)?.canImportSecrets) {
      throw new BadRequestError({
        message: `${SECRET_SYNC_NAME_MAP[destination]} does not support importing secrets.`
      });
    }

    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      actor.orgId,
      "Failed to trigger secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    if (secretSync.environment?.slug && secretSync.folder?.path) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.ImportSecrets,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment: secretSync.environment.slug,
          secretPath: secretSync.folder.path
        })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.ImportSecrets,
        ProjectPermissionSub.SecretSyncs
      );
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncImportSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      importStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  const triggerSecretSyncRemoveSecretsById = async (
    { syncId, destination, ...params }: TTriggerSecretSyncRemoveSecretsByIdDTO,
    actor: OrgServiceActor
  ) => {
    const secretSync = await secretSyncDAL.findById(syncId);

    if (!secretSync)
      throw new NotFoundError({
        message: `Could not find ${SECRET_SYNC_NAME_MAP[destination]} Sync with ID "${syncId}"`
      });

    await enterpriseSyncCheck(
      licenseService,
      secretSync.destination as SecretSync,
      actor.orgId,
      "Failed to trigger secret sync due to plan restriction. Upgrade plan to access enterprise secret syncs."
    );

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,

      projectId: secretSync.projectId
    });

    if (secretSync.environment?.slug && secretSync.folder?.path) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.RemoveSecrets,
        subject(ProjectPermissionSub.SecretSyncs, {
          environment: secretSync.environment.slug,
          secretPath: secretSync.folder.path
        })
      );
    } else {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.RemoveSecrets,
        ProjectPermissionSub.SecretSyncs
      );
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (!secretSync.folderId)
      throw new BadRequestError({
        message: `Invalid source configuration: folder no longer exists. Please configure a valid source and try again.`
      });

    const isSyncJobRunning = Boolean(await keyStore.getItem(KeyStorePrefixes.SecretSyncLock(syncId)));

    if (isSyncJobRunning)
      throw new BadRequestError({ message: `A job for this sync is already in progress. Please try again shortly.` });

    await secretSyncQueue.queueSecretSyncRemoveSecretsById({ syncId, ...params });

    const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
      removeStatus: SecretSyncStatus.Pending
    });

    return updatedSecretSync as TSecretSync;
  };

  return {
    listSecretSyncOptions,
    listSecretSyncsByProjectId,
    listSecretSyncsBySecretPath,
    findSecretSyncById,
    findSecretSyncByName,
    createSecretSync,
    updateSecretSync,
    deleteSecretSync,
    triggerSecretSyncSyncSecretsById,
    triggerSecretSyncImportSecretsById,
    triggerSecretSyncRemoveSecretsById
  };
};
