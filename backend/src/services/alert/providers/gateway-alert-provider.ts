import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { OrganizationActionScope } from "@app/db/schemas";
import {
  GATEWAY_OFFLINE_EVENT,
  GATEWAY_RESOURCE_TYPE,
  GatewayOfflinePayloadSchema
} from "@app/ee/services/gateway-v2/gateway-v2-events";
import { OrgPermissionGatewayActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";

import { TAlertPayload } from "../alert-channel-types";
import { formatUtcDate } from "../alert-format-fns";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { TGatewayAlertDALFactory } from "./gateway-alert-dal";

export { GATEWAY_OFFLINE_EVENT, GATEWAY_RESOURCE_TYPE };

const GatewayOfflineConditionSchema = z.object({}).nullish();

type TGatewayTarget = {
  gatewayId: string;
  name: string;
  lastSeenAt: Date;
};

export type TGatewayAlertProviderDep = {
  gatewayAlertDAL: TGatewayAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export const gatewayAlertProviderFactory = ({
  gatewayAlertDAL,
  permissionService
}: TGatewayAlertProviderDep): IEventAlertProvider<TGatewayTarget> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/networking`;

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TGatewayTarget[]> => {
    const parsed = GatewayOfflinePayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${GATEWAY_OFFLINE_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const lastSeenById = new Map(parsed.data.gateways.map((gateway) => [gateway.id, gateway.lastSeenAt]));
    const gateways = await gatewayAlertDAL.findGatewaysByIds(input.targetIds, input.orgId);

    return gateways.flatMap((gateway) => {
      const lastSeenAt = lastSeenById.get(gateway.id);
      return lastSeenAt ? [{ gatewayId: gateway.id, name: gateway.name, lastSeenAt }] : [];
    });
  };

  const buildPayload = (alert: TAlertContext, targets: TGatewayTarget[], viewUrl: string): TAlertPayload => {
    const [first] = targets;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        resourceType: alert.resourceType,
        viewUrl
      },
      eventKey: GATEWAY_OFFLINE_EVENT,
      eventLabel: "Offline",
      webhookType: "com.infisical.networking.gateway.offline",
      resourceKind: "Gateway",
      resourceOwnerKind: "Organization",
      severity: "critical",
      summary: targets.length === 1 ? `Gateway "${first.name}" is offline` : `${targets.length} gateways are offline`,
      items: targets.map((target) => ({
        id: target.gatewayId,
        title: target.name,
        summary: `Gateway "${target.name}" is offline`,
        identifier: target.gatewayId,
        fields: [{ label: "Last Seen", value: formatUtcDate(target.lastSeenAt) }]
      }))
    };
  };

  // The offline event carries no resourceId, so only org-wide alerts can hear it. An alert bound to one gateway
  // would never fire, and gateways belong to the organization, not to a project.
  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (input.resourceId) {
      throw new BadRequestError({
        message: "Gateway alerts apply to every gateway in the organization and cannot target one gateway"
      });
    }
    if (input.projectId) {
      throw new BadRequestError({
        message: "Gateway alerts apply to the whole organization and cannot be scoped to a project"
      });
    }
  };

  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      orgId: input.orgId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId
    });

    const actions = (() => {
      if (input.action === AlertPermissionAction.Read) return [OrgPermissionGatewayActions.ListGateways];
      if (input.action === AlertPermissionAction.Delete) return [OrgPermissionGatewayActions.EditGateways];
      return [OrgPermissionGatewayActions.EditGateways, OrgPermissionGatewayActions.ListGateways];
    })();

    for (const action of actions) {
      ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Gateway);
    }
  };

  return {
    resourceType: GATEWAY_RESOURCE_TYPE,
    events: [
      {
        key: GATEWAY_OFFLINE_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: GatewayOfflineConditionSchema
      }
    ],
    supportsScopeWideAlerts: true,
    recipientPolicy: { atOrgScope: true },
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.gatewayId,
    assertPermission,
    assertResourceInScope
  };
};
