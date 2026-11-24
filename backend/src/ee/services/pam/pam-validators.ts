import { ForbiddenError, subject } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { TKmsDataKeyService } from "@app/domains/platform/kms-core/ce/module";
import { assertIndividualGatewayAllowed } from "@app/ee/services/gateway-pool/gateway-pool-policy-fns";
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
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { TPamAccountSettingsOverrides } from "../pam-account-template/pam-account-template-schemas";
import {
  describeRecordingConnectionApps,
  isExternalRecordingBackend,
  PAM_RECORDING_BACKEND_DETAILS,
  PAM_RECORDING_CONNECTION_APPS,
  TPamExternalRecordingBackend
} from "../pam-session-recording/pam-recording-backends";
import {
  buildExternalRecordingConfig,
  getOverrideRecordingLocation,
  getRecordingLocation,
  getTemplateRecordingBackend,
  TPamRecordingLocation
} from "../pam-session-recording/pam-recording-config-fns";
import { PAM_RECORDING_STORAGE_FACTORY_MAP } from "../pam-session-recording/pam-recording-storage-factory";
import { normalizeKeyPrefix, TPamRecordingResolvedConfig } from "../pam-session-recording/pam-recording-storage-types";
import { TActorContext } from "./pam-permission";

export type TPamValidatorDeps = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne" | "findById">;
  kmsDataKeyService: TKmsDataKeyService;
  instanceConfigService: TInstanceConfigService;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export const validateGatewayAttachment = async (
  {
    permissionService,
    gatewayV2DAL,
    gatewayPoolService,
    orgDAL
  }: Pick<TPamValidatorDeps, "permissionService" | "gatewayV2DAL" | "gatewayPoolService" | "orgDAL">,
  gwId: string | null | undefined,
  poolId: string | null | undefined,
  ctx: TActorContext,
  // Feeds the org's gateway pool requirement; see assertIndividualGatewayAllowed.
  { previousGatewayId, inheritedFrom }: { previousGatewayId?: string | null; inheritedFrom?: string } = {}
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

    await assertIndividualGatewayAllowed({
      orgDAL,
      orgId: ctx.actorOrgId,
      gatewayId: gwId,
      previousGatewayId,
      inheritedFrom
    });
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

  if (!PAM_RECORDING_CONNECTION_APPS.includes(conn.app as AppConnection)) {
    throw new BadRequestError({
      message: "Recording connection must be an AWS, S3-Compatible Storage or Azure Blob Storage connection"
    });
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

export const validateRecordingStorageConfig = async (
  deps: Pick<
    TPamValidatorDeps,
    "permissionService" | "appConnectionDAL" | "kmsDataKeyService" | "instanceConfigService"
  >,
  connectionId: string,
  location: TPamRecordingLocation,
  ctx: TActorContext
): Promise<TPamRecordingResolvedConfig> => {
  const raw = await enforceAppConnectionConnect(deps, connectionId, ctx);
  const { name, connectionApps } = PAM_RECORDING_BACKEND_DETAILS[location.backend];
  if (!connectionApps.includes(raw.app as AppConnection)) {
    throw new BadRequestError({
      message: `${name} recordings need ${describeRecordingConnectionApps(location.backend)}`
    });
  }

  const appConnection = await decryptAppConnection(raw, deps.kmsDataKeyService);
  const resolvedConfig = await buildExternalRecordingConfig(location, appConnection, deps.instanceConfigService);
  await PAM_RECORDING_STORAGE_FACTORY_MAP[location.backend]().validateConfig({ config: resolvedConfig });

  return resolvedConfig;
};

export const resolveOverridesRecordingConfig = async (
  deps: Pick<
    TPamValidatorDeps,
    "permissionService" | "appConnectionDAL" | "kmsDataKeyService" | "instanceConfigService"
  >,
  templateSettings: unknown,
  settingsOverrides: TPamAccountSettingsOverrides | null | undefined,
  effectiveConnectionId: string | null | undefined,
  ctx: TActorContext,
  // an account that overrides only the connection still records to the location it inherits
  { inheritLocation }: { inheritLocation: boolean }
): Promise<TPamRecordingResolvedConfig | null> => {
  const backend = getTemplateRecordingBackend(templateSettings);
  const overriddenBackends = (Object.keys(PAM_RECORDING_BACKEND_DETAILS) as TPamExternalRecordingBackend[]).filter(
    (candidate) => settingsOverrides?.[PAM_RECORDING_BACKEND_DETAILS[candidate].settingsKey]
  );
  const mismatched = isExternalRecordingBackend(backend)
    ? overriddenBackends.find((candidate) => candidate !== backend)
    : undefined;
  if (isExternalRecordingBackend(backend) && mismatched) {
    throw new BadRequestError({
      message: `This account's template stores recordings in ${PAM_RECORDING_BACKEND_DETAILS[backend].name}, so the account can override its ${PAM_RECORDING_BACKEND_DETAILS[backend].locationName}, not an ${PAM_RECORDING_BACKEND_DETAILS[mismatched].name} ${PAM_RECORDING_BACKEND_DETAILS[mismatched].locationName}`
    });
  }

  // A database-backed template still gets its override checked, so it works once the template moves to that store
  const locationBackend = isExternalRecordingBackend(backend) ? backend : overriddenBackends[0];
  if (!locationBackend) return null;
  const location = inheritLocation
    ? getRecordingLocation(locationBackend, settingsOverrides, templateSettings)
    : getOverrideRecordingLocation(locationBackend, settingsOverrides);
  if (!location) return null;

  if (!effectiveConnectionId) {
    throw new BadRequestError({
      message: `${PAM_RECORDING_BACKEND_DETAILS[location.backend].name} recording config requires ${describeRecordingConnectionApps(location.backend)} on the account or template`
    });
  }

  return validateRecordingStorageConfig(deps, effectiveConnectionId, location, ctx);
};

export const mintCorsProbeUrl = async (resolvedConfig: TPamRecordingResolvedConfig): Promise<string | null> => {
  try {
    const probeKey = `${normalizeKeyPrefix(resolvedConfig.keyPrefix)}.cors-probe`;
    const provider = PAM_RECORDING_STORAGE_FACTORY_MAP[resolvedConfig.backend]();
    const { url } = await provider.mintPresignedGet({ config: resolvedConfig, objectKey: probeKey });
    return url;
  } catch {
    return null;
  }
};
