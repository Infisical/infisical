import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TPamSessionDALFactory } from "../pam-session/pam-session-dal";
import { PamRecordingStorageBackend } from "../pam-session-recording-storage/pam-session-recording-storage-enums";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "../pam-session-recording-storage/pam-session-recording-storage-factory";
import {
  normalizeKeyPrefix,
  TPamRecordingResolvedConfig
} from "../pam-session-recording-storage/pam-session-recording-storage-types";
import { TPamProjectRecordingConfigDALFactory } from "./pam-project-recording-config-dal";
import {
  TDeletePamRecordingConfigDTO,
  TGetPamRecordingConfigDTO,
  TUpsertPamRecordingConfigDTO
} from "./pam-project-recording-config-types";

type TPamProjectRecordingConfigServiceFactoryDep = {
  pamProjectRecordingConfigDAL: TPamProjectRecordingConfigDALFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "countActiveByProjectId">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "findAppConnectionById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TPamProjectRecordingConfigServiceFactory = ReturnType<typeof pamProjectRecordingConfigServiceFactory>;

export const pamProjectRecordingConfigServiceFactory = ({
  pamProjectRecordingConfigDAL,
  pamSessionDAL,
  permissionService,
  appConnectionService,
  appConnectionDAL,
  kmsService
}: TPamProjectRecordingConfigServiceFactoryDep) => {
  // Callers are responsible for their own authorization
  const resolveConfigForProject = async (projectId: string): Promise<TPamRecordingResolvedConfig | null> => {
    const row = await pamProjectRecordingConfigDAL.findByProjectId(projectId);
    if (!row) return null;

    if (row.storageBackend === PamRecordingStorageBackend.AwsS3) {
      const raw = await appConnectionDAL.findById(row.connectionId);
      if (!raw) throw new NotFoundError({ message: `AWS app connection ${row.connectionId} not found` });
      const appConnection = await decryptAppConnection(raw, kmsService);

      const awsConfig = await getAwsConnectionConfig(
        appConnection as unknown as TAwsConnectionConfig,
        row.region as never
      );

      return {
        backend: PamRecordingStorageBackend.AwsS3,
        bucket: row.bucket,
        region: row.region as AWSRegion,
        keyPrefix: row.keyPrefix ?? null,
        awsCredentials: awsConfig.credentials
      };
    }

    return {
      backend: PamRecordingStorageBackend.Postgres,
      keyPrefix: row.keyPrefix ?? null
    };
  };

  const getConfig = async ({ projectId }: TGetPamRecordingConfigDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Settings);

    const row = await pamProjectRecordingConfigDAL.findByProjectId(projectId);
    return { config: row ?? null };
  };

  const testConfig = async (input: TUpsertPamRecordingConfigDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId: input.projectId,
      actionProjectType: ActionProjectType.PAM
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    if (input.storageBackend !== PamRecordingStorageBackend.AwsS3) {
      throw new BadRequestError({ message: `Unsupported storage backend: ${input.storageBackend}` });
    }

    const appConnection = await appConnectionService.findAppConnectionById(
      AppConnection.AWS,
      input.connectionId,
      actor
    );
    if (!appConnection) throw new NotFoundError({ message: `AWS app connection ${input.connectionId} not found` });

    const awsConfig = await getAwsConnectionConfig(
      appConnection as unknown as TAwsConnectionConfig,
      input.region as never
    );

    const resolvedConfig: TPamRecordingResolvedConfig = {
      backend: PamRecordingStorageBackend.AwsS3,
      bucket: input.bucket,
      region: input.region,
      keyPrefix: input.keyPrefix ?? null,
      awsCredentials: awsConfig.credentials
    };

    const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[input.storageBackend]();
    await provider.validateConfig({ config: resolvedConfig });

    return { ok: true as const, resolvedConfig };
  };

  const upsertConfig = async (
    input: TUpsertPamRecordingConfigDTO,
    actor: OrgServiceActor,
    preValidatedConfig?: TPamRecordingResolvedConfig
  ) => {
    const resolvedConfig = preValidatedConfig ?? (await testConfig(input, actor)).resolvedConfig;

    const existing = await pamProjectRecordingConfigDAL.findByProjectId(input.projectId);

    const bucketChanging =
      existing &&
      (existing.bucket !== input.bucket ||
        existing.region !== input.region ||
        existing.keyPrefix !== (input.keyPrefix ?? null));

    if (bucketChanging) {
      const activeCount = await pamSessionDAL.countActiveByProjectId(input.projectId);
      if (activeCount > 0) {
        throw new BadRequestError({
          message: `Cannot change bucket configuration while ${activeCount} session${activeCount > 1 ? "s are" : " is"} in progress. End all active sessions first.`
        });
      }
    }

    let config;
    if (existing) {
      config = await pamProjectRecordingConfigDAL.updateById(existing.id, {
        storageBackend: input.storageBackend,
        connectionId: input.connectionId,
        bucket: input.bucket,
        region: input.region,
        keyPrefix: input.keyPrefix ?? null
      });
    } else {
      config = await pamProjectRecordingConfigDAL.create({
        projectId: input.projectId,
        storageBackend: input.storageBackend,
        connectionId: input.connectionId,
        bucket: input.bucket,
        region: input.region,
        keyPrefix: input.keyPrefix ?? null
      });
    }

    let corsProbeUrl: string | null = null;
    if (resolvedConfig) {
      try {
        const probeKey = `${normalizeKeyPrefix(resolvedConfig.keyPrefix)}.cors-probe`;
        const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[input.storageBackend]();
        const { url } = await provider.mintPresignedGet({ config: resolvedConfig, objectKey: probeKey });
        corsProbeUrl = url;
      } catch {
        // Non-fatal -- the config is already saved
      }
    }

    return { config, corsProbeUrl };
  };

  const deleteConfig = async ({ projectId }: TDeletePamRecordingConfigDTO, actor: OrgServiceActor) => {
    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorAuthMethod: actor.authMethod,
      actorId: actor.id,
      actorOrgId: actor.orgId,
      projectId,
      actionProjectType: ActionProjectType.PAM
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Settings);

    const existing = await pamProjectRecordingConfigDAL.findByProjectId(projectId);
    if (!existing) return { ok: true as const };

    const activeCount = await pamSessionDAL.countActiveByProjectId(projectId);
    if (activeCount > 0) {
      throw new BadRequestError({
        message: `Cannot disable recording configuration while ${activeCount} session${activeCount > 1 ? "s are" : " is"} in progress. End all active sessions first.`
      });
    }

    await pamProjectRecordingConfigDAL.deleteById(existing.id);
    return { ok: true as const };
  };

  return {
    getConfig,
    testConfig,
    upsertConfig,
    deleteConfig,
    resolveConfigForProject
  };
};
