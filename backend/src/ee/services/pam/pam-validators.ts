import { ForbiddenError } from "@casl/ability";

import { OrganizationActionScope } from "@app/db/schemas";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { NotFoundError } from "@app/lib/errors";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";

import { TActorContext } from "./pam-permission";

export type TPamValidatorDeps = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findOne">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveAttachableGatewayFromPool">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findOne">;
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

export const validateRecordingConnection = async (
  { appConnectionDAL }: Pick<TPamValidatorDeps, "appConnectionDAL">,
  connectionId: string | null | undefined,
  ctx: TActorContext
) => {
  if (connectionId) {
    const conn = await appConnectionDAL.findOne({ id: connectionId, orgId: ctx.actorOrgId });
    if (!conn) {
      throw new NotFoundError({ message: "Recording connection not found in your organization" });
    }
  }
};
