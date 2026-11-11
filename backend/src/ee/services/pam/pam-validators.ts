import type { TActorContext } from "@app/domains/lib/actor-context";
import { TInstanceConfigCoreDomain } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import {
  OrgPermissionAppConnectionActions,
  OrgPermissionGatewayActions,
  OrgPermissionSubjects,
  TOrganizationsDomain
} from "@app/domains/platform/organizations/ce/module";
import { assertIndividualGatewayAllowed } from "@app/ee/services/gateway-pool/gateway-pool-policy-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { toOrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import {
  PamAccountSettingsOverridesSchema,
  PamTemplateSettingsSchema,
  TPamAccountSettingsOverrides
} from "../pam-account-template/pam-account-template-schemas";
import {
  PAM_RECORDING_CONNECTION_APPS,
  resolveS3RecordingAccess
} from "../pam-session-recording/aws-s3/aws-s3-provider-factory";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "../pam-session-recording/pam-recording-storage-factory";
import { normalizeKeyPrefix, TPamRecordingResolvedConfig } from "../pam-session-recording/pam-recording-storage-types";

export type TPamValidatorDeps = {
  organizationsDomain: Pick<TOrganizationsDomain, "getOrgPermission">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne" | "findById">;
  kmsCoreDomain: TKmsCoreDomain;
  instanceConfigCoreDomain: Pick<TInstanceConfigCoreDomain, "getServerConfig">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export const validateGatewayAttachment = async (
  {
    organizationsDomain,
    gatewayV2DAL,
    gatewayPoolService,
    orgDAL
  }: Pick<TPamValidatorDeps, "organizationsDomain" | "gatewayV2DAL" | "gatewayPoolService" | "orgDAL">,
  gwId: string | null | undefined,
  poolId: string | null | undefined,
  ctx: TActorContext,
  // Feeds the org's gateway pool requirement; see assertIndividualGatewayAllowed.
  { previousGatewayId, inheritedFrom }: { previousGatewayId?: string | null; inheritedFrom?: string } = {}
) => {
  if (gwId) {
    const gw = await gatewayV2DAL.findOne({ id: gwId, orgId: ctx.org.id });
    if (!gw) {
      throw new NotFoundError({ message: "Gateway not found in your organization" });
    }

    const orgPermission = await organizationsDomain.getOrgPermission({ actor: ctx });
    orgPermission.assert({
      action: OrgPermissionGatewayActions.AttachGateways,
      subject: OrgPermissionSubjects.Gateway
    });

    await assertIndividualGatewayAllowed({
      orgDAL,
      orgId: ctx.org.id,
      gatewayId: gwId,
      previousGatewayId,
      inheritedFrom
    });
  }
  if (poolId) {
    await gatewayPoolService.resolveAttachableGatewayFromPool({
      poolId,
      orgId: ctx.org.id,
      actor: toOrgServiceActor(ctx)
    });
  }
};

const enforceAppConnectionConnect = async (
  { organizationsDomain, appConnectionDAL }: Pick<TPamValidatorDeps, "organizationsDomain" | "appConnectionDAL">,
  connectionId: string,
  ctx: TActorContext
) => {
  const conn = await appConnectionDAL.findById(connectionId);
  if (!conn) {
    throw new NotFoundError({ message: "Recording connection not found" });
  }

  if (!PAM_RECORDING_CONNECTION_APPS.includes(conn.app as AppConnection)) {
    throw new BadRequestError({
      message: "Recording connection must be an AWS or S3-Compatible Storage connection"
    });
  }

  if (conn.orgId !== ctx.org.id) {
    throw new NotFoundError({ message: "Recording connection not found" });
  }

  // PAM recording connections are org-scoped. Org-level Connect does not authorize a project-scoped
  // connection (that requires project-level Connect on its own project), so reject them outright.
  if (conn.projectId) {
    throw new BadRequestError({ message: "Recording connection must be an organization-level connection" });
  }

  const orgPermission = await organizationsDomain.getOrgPermission({ actor: ctx, orgId: conn.orgId });
  orgPermission.assert({
    action: OrgPermissionAppConnectionActions.Connect,
    subject: OrgPermissionSubjects.AppConnections,
    fields: { connectionId }
  });

  return conn;
};

export const validateRecordingConnection = async (
  deps: Pick<TPamValidatorDeps, "organizationsDomain" | "appConnectionDAL">,
  connectionId: string | null | undefined,
  ctx: TActorContext
) => {
  if (connectionId) {
    await enforceAppConnectionConnect(deps, connectionId, ctx);
  }
};

export const validateRecordingS3Config = async (
  deps: Pick<
    TPamValidatorDeps,
    "organizationsDomain" | "appConnectionDAL" | "kmsCoreDomain" | "instanceConfigCoreDomain"
  >,
  connectionId: string,
  s3Config: { bucket: string; region?: string; keyPrefix?: string },
  ctx: TActorContext
): Promise<TPamRecordingResolvedConfig> => {
  const raw = await enforceAppConnectionConnect(deps, connectionId, ctx);

  const appConnection = await decryptAppConnection(raw, deps.kmsCoreDomain);

  const resolvedConfig: TPamRecordingResolvedConfig = {
    backend: PamRecordingStorageBackend.AwsS3,
    bucket: s3Config.bucket,
    keyPrefix: s3Config.keyPrefix ?? null,
    ...(await resolveS3RecordingAccess(appConnection, s3Config.region, deps.instanceConfigCoreDomain))
  };

  const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[PamRecordingStorageBackend.AwsS3]();
  await provider.validateConfig({ config: resolvedConfig });

  return resolvedConfig;
};

export const getInheritedRecordingS3Config = (settingsOverrides: unknown, templateSettings: unknown) =>
  PamAccountSettingsOverridesSchema.safeParse(settingsOverrides).data?.recordingS3Config ??
  PamTemplateSettingsSchema.safeParse(templateSettings).data?.recordingS3Config;

export const resolveOverridesS3Config = async (
  deps: Pick<
    TPamValidatorDeps,
    "organizationsDomain" | "appConnectionDAL" | "kmsCoreDomain" | "instanceConfigCoreDomain"
  >,
  settingsOverrides: TPamAccountSettingsOverrides | null | undefined,
  effectiveConnectionId: string | null | undefined,
  ctx: TActorContext,
  // an account that overrides only the connection still records to the bucket it inherits
  inheritedS3Config?: TPamAccountSettingsOverrides["recordingS3Config"]
): Promise<TPamRecordingResolvedConfig | null> => {
  const s3Config = settingsOverrides?.recordingS3Config ?? inheritedS3Config;
  if (!s3Config) return null;

  if (!effectiveConnectionId) {
    throw new BadRequestError({
      message: "S3 recording config requires an AWS or S3-Compatible Storage connection on the account or template"
    });
  }

  return validateRecordingS3Config(deps, effectiveConnectionId, s3Config, ctx);
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
