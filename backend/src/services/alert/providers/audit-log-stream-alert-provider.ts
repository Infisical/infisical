import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { OrganizationActionScope } from "@app/db/schemas";
import {
  AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
  AUDIT_LOG_STREAM_RESOURCE_TYPE,
  AuditLogStreamDeliveryFailedPayloadSchema
} from "@app/ee/services/audit-log-stream/audit-log-stream-events";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TAlertPayload } from "../alert-channel-types";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { TAuditLogStreamAlertDALFactory } from "./audit-log-stream-alert-dal";

export { AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT, AUDIT_LOG_STREAM_RESOURCE_TYPE };

const DeliveryFailedConditionSchema = z.object({}).nullish();

const PROVIDER_LABELS: Record<string, string> = {
  azure: "Azure",
  cribl: "Cribl",
  custom: "Custom",
  datadog: "Datadog",
  splunk: "Splunk",
  "sumo-logic": "Sumo Logic"
};

type TAuditLogStreamTarget = {
  streamId: string;
  provider: string;
  errorMessage: string;
  droppedCount: number;
  failingSince: Date;
};

export type TAuditLogStreamAlertProviderDep = {
  auditLogStreamAlertDAL: TAuditLogStreamAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

const formatUtcDate = (date: Date): string =>
  new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short"
  });

export const auditLogStreamAlertProviderFactory = ({
  auditLogStreamAlertDAL,
  permissionService
}: TAuditLogStreamAlertProviderDep): IEventAlertProvider<TAuditLogStreamTarget> => {
  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/audit-logs?selectedTab=streams`;

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TAuditLogStreamTarget[]> => {
    const parsed = AuditLogStreamDeliveryFailedPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new Error(
        `Unreadable '${AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT}' payload: ${parsed.error.issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join(", ")}`
      );
    }

    const streams = await auditLogStreamAlertDAL.findStreamsByIds(input.targetIds, input.orgId);

    return streams.map((stream) => ({
      streamId: stream.id,
      provider: stream.provider,
      errorMessage: parsed.data.errorMessage,
      droppedCount: parsed.data.droppedCount,
      failingSince: parsed.data.failingSince
    }));
  };

  const buildPayload = (alert: TAlertContext, targets: TAuditLogStreamTarget[], viewUrl: string): TAlertPayload => {
    const [first] = targets;
    const providerLabel = (target: TAuditLogStreamTarget) => PROVIDER_LABELS[target.provider] ?? target.provider;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        resourceType: alert.resourceType,
        viewUrl
      },
      eventKey: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
      eventLabel: "Delivery Failed",
      webhookType: "com.infisical.audit-log.stream.delivery-failed",
      resourceKind: "Audit Log Stream",
      resourceOwnerKind: "Organization",
      severity: "critical",
      summary:
        targets.length === 1
          ? `Audit log events are being dropped because the ${providerLabel(first)} stream cannot be reached`
          : `Audit log events are being dropped on ${targets.length} streams`,
      items: targets.map((target) => ({
        id: target.streamId,
        title: `${providerLabel(target)} stream`,
        identifier: target.streamId,
        fields: [
          { label: "Provider", value: providerLabel(target) },
          { label: "Error", value: target.errorMessage },
          { label: "Dropped Events", value: String(target.droppedCount) },
          { label: "Failing Since", value: formatUtcDate(target.failingSince) }
        ]
      }))
    };
  };

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;

    const stream = await auditLogStreamAlertDAL.findStreamInOrg(input.resourceId, input.orgId);
    if (!stream) {
      throw new NotFoundError({ message: `Audit Log Stream '${input.resourceId}' was not found in this organization` });
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
      if (input.action === AlertPermissionAction.Read) return [OrgPermissionActions.Read];
      if (input.action === AlertPermissionAction.Delete) return [OrgPermissionActions.Edit];
      return [OrgPermissionActions.Edit, OrgPermissionActions.Read];
    })();

    for (const action of actions) {
      ForbiddenError.from(permission).throwUnlessCan(action, OrgPermissionSubjects.Settings);
    }
  };

  return {
    resourceType: AUDIT_LOG_STREAM_RESOURCE_TYPE,
    events: [
      {
        key: AUDIT_LOG_STREAM_DELIVERY_FAILED_EVENT,
        triggerType: AlertTriggerType.Event,
        conditionSchema: DeliveryFailedConditionSchema
      }
    ],
    supportsScopeWideAlerts: true,
    recipientPolicy: { atOrgScope: true },
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.streamId,
    assertPermission,
    assertResourceInScope
  };
};
