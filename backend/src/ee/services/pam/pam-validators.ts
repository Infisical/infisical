import { ForbiddenError, subject } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionGatewayActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TPamAccountSettingsOverrides } from "../pam-account-template/pam-account-template-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "../pam-session-recording/pam-recording-storage-factory";
import { normalizeKeyPrefix, TPamRecordingResolvedConfig } from "../pam-session-recording/pam-recording-storage-types";
import { TActorContext } from "./pam-permission";

export type TPamValidatorDeps = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne" | "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export const validateGatewayAttachment = async (
  {
    permissionService,
    gatewayV2DAL,
    gatewayPoolService
  }: Pick<TPamValidatorDeps, "permissionService" | "gatewayV2DAL" | "gatewayPoolService">,
  gwId: string | null | undefined,
  poolId: string | null | undefined,
  ctx: TActorContext
) => {
  if (gwId) {
    const gw = await gatewayV2DAL.findOne({ id: gwId, orgId: ctx.actorOrgId });
    if (!gw) {
      throw new NotFoundError({ message: "Gateway not found in your organization" });
    }

    const { permission: orgPermission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: ctx.actor,
      actorId: ctx.actorId,
      orgId: ctx.actorOrgId,
      actorAuthMethod: ctx.actorAuthMethod,
      actorOrgId: ctx.actorOrgId
    });
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionGatewayActions.AttachGateways,
      OrgPermissionSubjects.Gateway
    );
  }
  if (poolId) {
    await gatewayPoolService.resolveAttachableGatewayFromPool({
      poolId,
      orgId: ctx.actorOrgId,
      actor: { type: ctx.actor, id: ctx.actorId, authMethod: ctx.actorAuthMethod, orgId: ctx.actorOrgId }
    });
  }
};

const enforceAppConnectionConnect = async (
  { permissionService, appConnectionDAL }: Pick<TPamValidatorDeps, "permissionService" | "appConnectionDAL">,
  connectionId: string,
  ctx: TActorContext
) => {
  const conn = await appConnectionDAL.findById(connectionId);
  if (!conn) {
    throw new NotFoundError({ message: "Recording connection not found" });
  }

  if (conn.app !== AppConnection.AWS) {
    throw new BadRequestError({ message: "Recording connection must be an AWS connection" });
  }

  if (conn.orgId !== ctx.actorOrgId) {
    throw new NotFoundError({ message: "Recording connection not found" });
  }

  // PAM recording connections are org-scoped. Org-level Connect does not authorize a project-scoped
  // connection (that requires project-level Connect on its own project), so reject them outright.
  if (conn.projectId) {
    throw new BadRequestError({ message: "Recording connection must be an organization-level connection" });
  }

  const { permission: orgPermission } = await permissionService.getOrgPermission({
    actorId: ctx.actorId,
    actor: ctx.actor,
    orgId: conn.orgId,
    actorOrgId: ctx.actorOrgId,
    actorAuthMethod: ctx.actorAuthMethod,
    scope: OrganizationActionScope.Any
  });
  ForbiddenError.from(orgPermission).throwUnlessCan(
    OrgPermissionAppConnectionActions.Connect,
    subject(OrgPermissionSubjects.AppConnections, { connectionId })
  );

  return conn;
};

export const validateRecordingConnection = async (
  deps: Pick<TPamValidatorDeps, "permissionService" | "appConnectionDAL">,
  connectionId: string | null | undefined,
  ctx: TActorContext
) => {
  if (connectionId) {
    await enforceAppConnectionConnect(deps, connectionId, ctx);
  }
};

export const validateRecordingS3Config = async (
  deps: Pick<TPamValidatorDeps, "permissionService" | "appConnectionDAL" | "kmsService">,
  connectionId: string,
  s3Config: { bucket: string; region: string; keyPrefix?: string },
  ctx: TActorContext
): Promise<TPamRecordingResolvedConfig> => {
  const raw = await enforceAppConnectionConnect(deps, connectionId, ctx);

  const appConnection = await decryptAppConnection(raw, deps.kmsService);
  const awsConfig = await getAwsConnectionConfig(
    appConnection as unknown as TAwsConnectionConfig,
    (s3Config.region as AWSRegion) ?? AWSRegion.US_EAST_1
  );

  const resolvedConfig: TPamRecordingResolvedConfig = {
    backend: PamRecordingStorageBackend.AwsS3,
    bucket: s3Config.bucket,
    region: s3Config.region as AWSRegion,
    keyPrefix: s3Config.keyPrefix ?? null,
    awsCredentials: awsConfig.credentials
  };

  const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[PamRecordingStorageBackend.AwsS3]();
  await provider.validateConfig({ config: resolvedConfig });

  return resolvedConfig;
};

export const resolveOverridesS3Config = async (
  deps: Pick<TPamValidatorDeps, "permissionService" | "appConnectionDAL" | "kmsService">,
  settingsOverrides: TPamAccountSettingsOverrides | null | undefined,
  effectiveConnectionId: string | null | undefined,
  ctx: TActorContext
): Promise<TPamRecordingResolvedConfig | null> => {
  if (!settingsOverrides?.recordingS3Config) return null;

  if (!effectiveConnectionId) {
    throw new BadRequestError({
      message: "S3 recording config requires an AWS connection on the account or template"
    });
  }

  return validateRecordingS3Config(deps, effectiveConnectionId, settingsOverrides.recordingS3Config, ctx);
};

export const mintCorsProbeUrl = async (resolvedConfig: TPamRecordingResolvedConfig): Promise<string | null> => {
  try {
    const probeKey = `${normalizeKeyPrefix(resolvedConfig.keyPrefix)}.cors-probe`;
    const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[PamRecordingStorageBackend.AwsS3]();
    const { url } = await provider.mintPresignedGet({ config: resolvedConfig, objectKey: probeKey });
    return url;
  } catch {
    return null;
  }
};
