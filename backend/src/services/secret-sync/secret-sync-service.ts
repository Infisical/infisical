import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
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
import { BadRequestError, DatabaseError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { deepEqualSkipFields } from "@app/lib/fn/object";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { OrgServiceActor } from "@app/lib/types";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotServiceFactory } from "@app/services/project-bot/project-bot-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectFolderGrantDALFactory } from "@app/services/project-folder-grant/project-folder-grant-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import {
  enterpriseSyncCheck,
  listSecretSyncOptions,
  preSaveTransformDestinationConfig,
  preSaveTransformSyncOptions
} from "@app/services/secret-sync/secret-sync-fns";
import { buildSyncPayload, resolveSyncFolders } from "@app/services/secret-sync/secret-sync-recursive-fns";
import {
  SecretSyncStatus,
  TCheckDuplicateDestinationDTO,
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
import { expandSecretReferencesFactory } from "@app/services/secret-v2-bridge/secret-reference-fns";

import { TAppConnectionDALFactory } from "../app-connection/app-connection-dal";
import { TKmsServiceFactory } from "../kms/kms-service";
import { TSecretImportDALFactory } from "../secret-import/secret-import-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretSyncDALFactory } from "./secret-sync-dal";
import {
  DESTINATION_DUPLICATE_CHECK_MAP,
  SECRET_SYNC_CONNECTION_MAP,
  SECRET_SYNC_NAME_MAP,
  SECRET_SYNC_SKIP_FIELDS_MAP
} from "./secret-sync-maps";
import { TSecretSyncQueueFactory } from "./secret-sync-queue";

type TSecretSyncServiceFactoryDep = {
  secretSyncDAL: TSecretSyncDALFactory;
  secretImportDAL: TSecretImportDALFactory;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "findOne" | "find" | "findByFolderId" | "findByFolderIds">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOrgById">;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findByProjectId" | "findById" | "findBySecretPath" | "find" | "findByManySecretPath"
  >;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  projectDAL: Pick<TProjectDALFactory, "find">;
  projectFolderGrantDAL: Pick<TProjectFolderGrantDALFactory, "find">;
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
  projectEnvDAL,
  projectDAL,
  projectFolderGrantDAL,
  secretImportDAL,
  secretV2BridgeDAL,
  appConnectionDAL,
  appConnectionService,
  kmsService,
  permissionService,
  orgDAL,
  projectBotService,
  secretSyncQueue,
  keyStore,
  licenseService
}: TSecretSyncServiceFactoryDep) => {
  const getConnectionId = (sync: { connectionId?: string; connection?: { id: string } }) =>
    sync.connectionId ?? sync.connection?.id;

  const getSecretSyncSubject = (
    sync: {
      environment?: { slug: string } | null;
      folder?: { path: string } | null;
      connectionId?: string;
      connection?: { id: string };
    },
    overrides?: { connectionId?: string }
  ) => {
    const connectionId = overrides?.connectionId ?? getConnectionId(sync);
    const envSlug = sync.environment?.slug;
    const secretPath = sync.folder?.path;
    const hasAny = connectionId || envSlug || secretPath;
    if (!hasAny) return ProjectPermissionSub.SecretSyncs;
    return subject(ProjectPermissionSub.SecretSyncs, {
      ...(envSlug && { environment: envSlug }),
      ...(secretPath && { secretPath }),
      ...(connectionId && { connectionId })
    });
  };

  const preSaveTransformDeps = { secretV2BridgeDAL, appConnectionDAL, kmsService };

  // The sync worker reads its folders with every access check disabled, so this is the only place
  // the actor's read access to them is established. A recursive sync reads the whole subtree, and
  // folder grants let an actor hold read on a parent while being denied on a child.
  const $assertCanReadSyncedFolders = async (
    projectPermission: Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>["permission"],
    {
      projectId,
      environment,
      sourcePath,
      sourceFolderId,
      recursive
    }: {
      projectId: string;
      environment: string;
      sourcePath: string;
      sourceFolderId: string;
      recursive: boolean;
    }
  ) => {
    const folders = await resolveSyncFolders({
      folderDAL,
      projectEnvDAL,
      projectId,
      environment,
      sourcePath,
      sourceFolderId,
      recursive
    });

    for (const { path } of folders) {
      try {
        throwIfMissingSecretReadValueOrDescribePermission(
          projectPermission,
          ProjectPermissionSecretActions.DescribeSecret,
          {
            environment,
            secretPath: path
          }
        );
      } catch (error) {
        if (!(error instanceof ForbiddenError)) throw error;

        throw new ForbiddenRequestError({
          message:
            path === sourcePath
              ? `You do not have permission to read secrets at path "${path}" in environment "${environment}".`
              : `You do not have permission to read secrets at path "${path}" in environment "${environment}". This sync includes subfolders, so it reads every folder beneath "${sourcePath}".`
        });
      }
    }
  };

  // Flattening a subtree onto a destination that holds one flat list can produce two secrets with
  // the same destination key. flatten() is what detects that, and the job runs it on every sync, so
  // calling it here means a user reads the same sentence at save time and when the sync later drifts
  // into the same state.
  const $assertSyncableAtDestination = async ({
    projectId,
    actorOrgId,
    environment,
    sourcePath,
    sourceFolderId,
    recursive,
    keySchema
  }: {
    projectId: string;
    actorOrgId: string;
    environment: string;
    sourcePath: string;
    sourceFolderId: string;
    recursive: boolean;
    keySchema?: string;
  }) => {
    if (!recursive) return;

    const { decryptor: secretManagerDecryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId
    });

    const decryptSecretValue = (value?: Buffer | null) =>
      value ? secretManagerDecryptor({ cipherTextBlob: value }).toString() : "";

    const { expandSecretReferences } = expandSecretReferencesFactory({
      decryptSecretValue,
      secretDAL: secretV2BridgeDAL,
      folderDAL,
      projectId,
      canExpandValue: () => true,
      actorOrgId,
      orgDAL,
      licenseService,
      projectFolderGrantDAL,
      projectDAL,
      kmsService
    });

    try {
      const payload = await buildSyncPayload(
        {
          folderDAL,
          projectEnvDAL,
          secretV2BridgeDAL,
          secretImportDAL,
          expandSecretReferences,
          decryptSecretValue,
          fnSecretsV2FromImportsDeps: {
            projectFolderGrantDAL,
            actorOrgId,
            orgDAL,
            licenseService,
            kmsService
          }
        },
        {
          projectId,
          environment,
          sourcePath,
          sourceFolderId,
          recursive,
          keySchema,
          includeImports: true,
          dedupeForRemoval: false
        }
      );

      payload.flatten();
    } catch (error) {
      if (error instanceof SecretSyncError) throw new BadRequestError({ message: error.message });

      throw error;
    }
  };

  const listSecretSyncsByProjectId = async (
    { projectId, destination }: TListSecretSyncsByProjectId,
    actor: OrgServiceActor
  ) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
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
      permission.can(ProjectPermissionSecretSyncActions.Read, getSecretSyncSubject(secretSync))
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
      actionProjectType: ActionProjectType.SecretManager,
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

    return secretSyncs.filter((sync) =>
      permission.can(ProjectPermissionSecretSyncActions.Read, getSecretSyncSubject(sync))
    ) as TSecretSync[];
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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      getSecretSyncSubject(secretSync)
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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      getSecretSyncSubject(secretSync)
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    return secretSync as TSecretSync;
  };

  const checkDuplicateDestination = async (
    { destination, destinationConfig, connectionId, excludeSyncId, projectId }: TCheckDuplicateDestinationDTO,
    actor: OrgServiceActor
  ) => {
    const skipFields = SECRET_SYNC_SKIP_FIELDS_MAP[destination];
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      actionProjectType: ActionProjectType.SecretManager,
      projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Read,
      ProjectPermissionSub.SecretSyncs
    );

    // An absent config means the caller has not filled the form in yet, so there is nothing to
    // compare. An empty one is different: a destination whose scope comes entirely from its
    // connection has no fields to send, and skipping those would leave them with no check at all.
    if (!destinationConfig) {
      return { hasDuplicate: false, duplicateProjectId: undefined };
    }

    try {
      const existingSyncs = await secretSyncDAL.findByDestinationAndOrgId(destination, actor.orgId);

      const connectionCache = new Map<string, Promise<TAppConnection>>();
      const decryptConnection = (connId: string): Promise<TAppConnection> => {
        const cached = connectionCache.get(connId);
        if (cached) return cached;

        const promise = (async () => {
          const conn = await appConnectionDAL.findById(connId);
          if (!conn || conn.orgId !== actor.orgId) {
            throw new NotFoundError({ message: `App connection with ID "${connId}" not found` });
          }
          const credentials = await decryptAppConnectionCredentials({
            orgId: conn.orgId,
            encryptedCredentials: conn.encryptedCredentials,
            kmsService,
            projectId: conn.projectId
          });
          return { ...conn, credentials } as TAppConnection;
        })();

        connectionCache.set(connId, promise);
        return promise;
      };

      const candidates = existingSyncs.filter((sync) => {
        if (sync.id === excludeSyncId) return false;
        return deepEqualSkipFields(sync.destinationConfig, destinationConfig, skipFields);
      });

      const duplicateCheckResults = await Promise.all(
        candidates.map(async (sync) => {
          try {
            const isDuplicate = await DESTINATION_DUPLICATE_CHECK_MAP[destination]({
              existingSync: {
                connectionId: sync.connectionId,
                destinationConfig: sync.destinationConfig as Record<string, unknown>
              },
              newSync: {
                connectionId: connectionId ?? null,
                destinationConfig
              },
              decryptConnection
            });
            return isDuplicate ? sync : null;
          } catch {
            return null;
          }
        })
      );

      const duplicates = duplicateCheckResults.filter(Boolean);

      const hasDuplicate = duplicates.length > 0;

      let duplicateProjectId: string | undefined;
      if (hasDuplicate) {
        const duplicateProject = duplicates[0]!.projectId;
        try {
          await permissionService.getProjectPermission({
            actor: actor.type,
            actorId: actor.id,
            actorAuthMethod: actor.authMethod,
            actorOrgId: actor.orgId,
            actionProjectType: ActionProjectType.SecretManager,
            projectId: duplicateProject
          });
          duplicateProjectId = duplicateProject;
        } catch {
          logger.warn(
            `Duplicate secret sync destination detected but actor has no access to conflicting project [actorId=${actor.id}] [duplicateProjectId=${duplicateProject}]`
          );
        }
      }

      return {
        hasDuplicate,
        duplicateProjectId
      };
    } catch (error) {
      return { hasDuplicate: false, duplicateProjectId: undefined };
    }
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

    // secretSyncLimit is uncapped by default (null); only enforce a cap when the plan configures a
    // numeric limit. Counted org-wide right before creation.
    const plan = await licenseService.getPlan(actor.orgId);
    if (typeof plan.secretSyncLimit === "number") {
      const currentSecretSyncCount = await secretSyncDAL.countByOrgId(actor.orgId);
      if (currentSecretSyncCount >= plan.secretSyncLimit) {
        throw new BadRequestError({
          message: "Failed to create secret sync due to plan limit reached. Upgrade plan to add more secret syncs."
        });
      }
    }

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
      throw new BadRequestError({ message: "Project version does not support Secret Syncs" });

    ForbiddenError.from(projectPermission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Create,
      subject(ProjectPermissionSub.SecretSyncs, {
        environment,
        secretPath,
        ...(params.connectionId && { connectionId: params.connectionId })
      })
    );

    const folder = await folderDAL.findBySecretPath(projectId, environment, secretPath);

    if (!folder)
      throw new BadRequestError({
        message: `Could not find folder with path "${secretPath}" in environment "${environment}" for project with ID "${projectId}"`
      });

    const requestedSyncOptions = params.syncOptions as { recursive?: boolean; keySchema?: string } | undefined;
    const isRecursive = Boolean(requestedSyncOptions?.recursive);

    await $assertCanReadSyncedFolders(projectPermission, {
      projectId,
      environment,
      sourcePath: secretPath,
      sourceFolderId: folder.id,
      recursive: isRecursive
    });

    // Runs after the permission check above: the conflict it raises names every folder beneath the
    // source, including ones this actor is denied on.
    await $assertSyncableAtDestination({
      projectId,
      actorOrgId: actor.orgId,
      environment,
      sourcePath: secretPath,
      sourceFolderId: folder.id,
      recursive: isRecursive,
      keySchema: requestedSyncOptions?.keySchema
    });

    // getProjectPermission above throws NotFoundError if the project doesn't exist and
    // guarantees actor.orgId === project.orgId — no separate project lookup needed.
    const organization = await requestMemoize(requestMemoKeys.orgFindById(actor.orgId), () =>
      orgDAL.findById(actor.orgId)
    );
    if (organization?.blockDuplicateSecretSyncDestinations) {
      const duplicateCheck = await checkDuplicateDestination(
        {
          destination: params.destination,
          destinationConfig: params.destinationConfig,
          connectionId: params.connectionId,
          projectId
        },
        actor
      );
      if (duplicateCheck.hasDuplicate) {
        throw new BadRequestError({
          message: `A secret sync with this destination already exists${
            duplicateCheck.duplicateProjectId
              ? ` in project ${duplicateCheck.duplicateProjectId}`
              : " in another project in your organization"
          }.`
        });
      }
    }

    const destinationApp = SECRET_SYNC_CONNECTION_MAP[params.destination];

    // validates permission to connect and app is valid for sync destination
    await appConnectionService.validateAppConnectionUsageById(
      destinationApp,
      { connectionId: params.connectionId, projectId },
      actor
    );

    const resolvedSyncOptions = await preSaveTransformSyncOptions(
      params.destination,
      { syncOptions: params.syncOptions as Record<string, unknown> | undefined, folderId: folder.id },
      preSaveTransformDeps
    );

    const enrichedDestinationConfig = await preSaveTransformDestinationConfig(
      params.destination,
      {
        destinationConfig: params.destinationConfig as Record<string, unknown> | undefined,
        connectionId: params.connectionId
      },
      preSaveTransformDeps
    );

    try {
      const secretSync = await secretSyncDAL.create({
        folderId: folder.id,
        ...params,
        ...(resolvedSyncOptions && { syncOptions: resolvedSyncOptions }),
        ...(enrichedDestinationConfig && { destinationConfig: enrichedDestinationConfig }),
        ...(params.isAutoSyncEnabled && { syncStatus: SecretSyncStatus.Pending }),
        projectId
      });

      if (secretSync.isAutoSyncEnabled)
        await secretSyncQueue.queueSecretSyncSyncSecretsById({
          syncId: secretSync.id
        });

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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    const connectionId = secretSync.connectionId ?? secretSync.connection?.id;

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Edit,
      getSecretSyncSubject(secretSync)
    );

    // if the user is updating the secret path or environment, we need to check the permission against the new values
    if (secretPath || environment) {
      const environmentToCheck = environment || secretSync.environment?.slug || "";
      const secretPathToCheck = secretPath || secretSync.folder?.path || "";

      if (environmentToCheck && secretPathToCheck) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionSecretSyncActions.Edit,
          subject(ProjectPermissionSub.SecretSyncs, {
            environment: environmentToCheck,
            secretPath: secretPathToCheck,
            ...(connectionId && { connectionId })
          })
        );
      }
    }

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    let { folderId } = secretSync;

    if (params.destinationConfig || params.connectionId) {
      // getProjectPermission above throws NotFoundError if the project doesn't exist and
      // guarantees actor.orgId === project.orgId — no separate project lookup needed.
      const organization = await requestMemoize(requestMemoKeys.orgFindById(actor.orgId), () =>
        orgDAL.findById(actor.orgId)
      );

      if (organization?.blockDuplicateSecretSyncDestinations) {
        const duplicateCheck = await checkDuplicateDestination(
          {
            destination,
            destinationConfig: params.destinationConfig ?? (secretSync.destinationConfig as Record<string, unknown>),
            connectionId: params.connectionId ?? connectionId,
            projectId: secretSync.projectId,
            excludeSyncId: secretSync.id
          },
          actor
        );
        if (duplicateCheck.hasDuplicate) {
          throw new BadRequestError({
            message: `A secret sync with this destination already exists${
              duplicateCheck.duplicateProjectId ? ` in project ${duplicateCheck.duplicateProjectId}` : ""
            }.`
          });
        }
      }
    }

    if (params.connectionId) {
      const destinationApp = SECRET_SYNC_CONNECTION_MAP[secretSync.destination as SecretSync];

      // validates permission to connect and app is valid for sync destination
      await appConnectionService.validateAppConnectionUsageById(
        destinationApp,
        { connectionId: params.connectionId, projectId: secretSync.projectId },
        actor
      );

      // If changing connectionId, verify user has Edit permission for syncs with the NEW connectionId
      if (params.connectionId !== connectionId) {
        ForbiddenError.from(permission).throwUnlessCan(
          ProjectPermissionSecretSyncActions.Edit,
          getSecretSyncSubject(secretSync, { connectionId: params.connectionId })
        );
      }
    }

    const isSourceChanged =
      (Boolean(secretPath) && secretPath !== secretSync.folder?.path) ||
      (Boolean(environment) && environment !== secretSync.environment?.slug);

    const wasRecursive = Boolean((secretSync.syncOptions as { recursive?: boolean } | undefined)?.recursive);
    const isRecursive = Boolean((params.syncOptions as { recursive?: boolean } | undefined)?.recursive ?? wasRecursive);

    // Every update to a recursive sync re-authorizes the whole subtree, because an actor holding
    // Edit on the source folder can otherwise repoint an existing recursive sync at a destination
    // they control and read descendants they were never granted. A non-recursive sync covers only
    // its source folder, so it re-authorizes when that source actually changes.
    if (isSourceChanged || isRecursive) {
      const updatedEnvironment = environment ?? secretSync.environment?.slug;
      const updatedSecretPath = secretPath ?? secretSync.folder?.path;

      if (!updatedEnvironment || !updatedSecretPath)
        throw new BadRequestError({ message: "Must specify both source environment and secret path" });

      if (isSourceChanged) {
        const newFolder = await folderDAL.findBySecretPath(secretSync.projectId, updatedEnvironment, updatedSecretPath);

        if (!newFolder)
          throw new BadRequestError({
            message: `Could not find folder with path "${updatedSecretPath}" in environment "${updatedEnvironment}" for project with ID "${secretSync.projectId}"`
          });

        folderId = newFolder.id;
      }

      if (!folderId)
        throw new BadRequestError({
          message: `Could not find folder with path "${updatedSecretPath}" in environment "${updatedEnvironment}" for project with ID "${secretSync.projectId}"`
        });

      await $assertCanReadSyncedFolders(permission, {
        projectId: secretSync.projectId,
        environment: updatedEnvironment,
        sourcePath: updatedSecretPath,
        sourceFolderId: folderId,
        recursive: isRecursive
      });

      await $assertSyncableAtDestination({
        projectId: secretSync.projectId,
        actorOrgId: actor.orgId,
        environment: updatedEnvironment,
        sourcePath: updatedSecretPath,
        sourceFolderId: folderId,
        recursive: isRecursive,
        keySchema:
          (params.syncOptions as { keySchema?: string } | undefined)?.keySchema ??
          (secretSync.syncOptions as { keySchema?: string } | undefined)?.keySchema
      });
    }

    const isAutoSyncEnabled = params.isAutoSyncEnabled ?? secretSync.isAutoSyncEnabled;

    const resolvedSyncOptions = folderId
      ? await preSaveTransformSyncOptions(
          destination,
          {
            syncOptions: params.syncOptions as Record<string, unknown> | undefined,
            existingSyncOptions: secretSync.syncOptions as Record<string, unknown> | undefined,
            folderId
          },
          preSaveTransformDeps
        )
      : (params.syncOptions as Record<string, unknown> | undefined);

    const connectionIdForEnrich = params.connectionId ?? secretSync.connectionId;

    const enrichedDestinationConfig = connectionIdForEnrich
      ? await preSaveTransformDestinationConfig(
          destination,
          {
            destinationConfig: params.destinationConfig as Record<string, unknown> | undefined,
            connectionId: connectionIdForEnrich
          },
          preSaveTransformDeps
        )
      : params.destinationConfig;

    try {
      const updatedSecretSync = await secretSyncDAL.updateById(syncId, {
        ...params,
        ...(resolvedSyncOptions && { syncOptions: resolvedSyncOptions }),
        ...(enrichedDestinationConfig && { destinationConfig: enrichedDestinationConfig }),
        ...(isAutoSyncEnabled && folderId && { syncStatus: SecretSyncStatus.Pending }),
        folderId
      });

      if (updatedSecretSync.isAutoSyncEnabled)
        await secretSyncQueue.queueSecretSyncSyncSecretsById({
          syncId: secretSync.id
        });

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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.Delete,
      getSecretSyncSubject(secretSync)
    );

    if (secretSync.connection.app !== SECRET_SYNC_CONNECTION_MAP[destination])
      throw new BadRequestError({
        message: `Secret sync with ID "${secretSync.id}" is not configured for ${SECRET_SYNC_NAME_MAP[destination]}`
      });

    if (removeSecrets) {
      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionSecretSyncActions.RemoveSecrets,
        getSecretSyncSubject(secretSync)
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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.SyncSecrets,
      getSecretSyncSubject(secretSync)
    );

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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.ImportSecrets,
      getSecretSyncSubject(secretSync)
    );

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
      actionProjectType: ActionProjectType.SecretManager,
      projectId: secretSync.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionSecretSyncActions.RemoveSecrets,
      getSecretSyncSubject(secretSync)
    );

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
    triggerSecretSyncRemoveSecretsById,
    checkDuplicateDestination
  };
};
