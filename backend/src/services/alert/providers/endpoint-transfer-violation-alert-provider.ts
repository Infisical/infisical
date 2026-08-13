import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TAlertPayload } from "../alert-channel-types";
import {
  AlertPermissionAction,
  IResourceAlertProvider,
  TAlertContext,
  TAlertPermissionInput,
  TFindDueTargetsInput
} from "../alert-types";
import { EndpointNetworkRuleType } from "@app/ee/services/endpoint/endpoint-enums";

import {
  TEndpointTransferViolationAlertDALFactory,
  TEndpointTransferViolationTarget
} from "./endpoint-transfer-violation-alert-dal";

export const ENDPOINT_TRANSFER_VIOLATION_RESOURCE_TYPE = "endpoint.transfer_violation";
export const ENDPOINT_TRANSFER_VIOLATION_EVENT = "endpoint.transfer_violation.tripped";

// How far back a dispatch looks. Generous relative to the event-driven enqueue, which fires within
// seconds, because the daily cron is the safety net that has to catch anything a dropped enqueue or
// a restart lost. Dedup on the event id is what stops the overlap mailing twice.
const VIOLATION_LOOKBACK_HOURS = 25;

// One dispatch reports at most this many trips. A device being actively drained can trip every
// minute, and an email listing hundreds of them is not more useful than one listing the newest.
const MAX_VIOLATIONS_PER_RUN = 50;

// Every trip is the same event, so there is no per-condition "when" to configure yet. Kept as an
// object rather than z.never() so a future condition (a device filter, a minimum size) is an
// additive change to this schema rather than a new resource type.
const EndpointTransferViolationConditionSchema = z.object({}).strict().default({});

const formatBytes = (bytes: number | null) => {
  if (bytes === null) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};

const targetId = (target: TEndpointTransferViolationTarget): string => target.eventId;

type TEndpointTransferViolationAlertProviderDep = {
  endpointTransferViolationAlertDAL: TEndpointTransferViolationAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export const endpointTransferViolationAlertProviderFactory = ({
  endpointTransferViolationAlertDAL,
  permissionService
}: TEndpointTransferViolationAlertProviderDep): IResourceAlertProvider<TEndpointTransferViolationTarget> => {
  const findDueTargets = async (input: TFindDueTargetsInput): Promise<TEndpointTransferViolationTarget[]> => {
    // The alert is bound to one transfer limit, so an alert without a rule has nothing to watch.
    if (!input.resourceId) return [];

    const since = new Date(input.asOf.getTime() - VIOLATION_LOOKBACK_HOURS * 60 * 60 * 1000);

    return endpointTransferViolationAlertDAL.findRecentViolations({
      orgId: input.orgId,
      networkRuleId: input.resourceId,
      since,
      limit: MAX_VIOLATIONS_PER_RUN
    });
  };

  // The org's Endpoint devices list, which is where someone reading this email needs to land. Not a
  // per-device link: one alert can carry trips from several machines.
  const buildViewUrl = async (alert: TAlertContext): Promise<string> => {
    const appCfg = getConfig();
    return `${appCfg.SITE_URL}/organizations/${alert.orgId}/endpoint/devices`;
  };

  const buildPayload = (
    alert: TAlertContext,
    targets: TEndpointTransferViolationTarget[],
    viewUrl: string
  ): TAlertPayload => ({
    alert: {
      id: alert.id,
      name: alert.name,
      orgId: alert.orgId,
      ...(alert.projectId ? { projectId: alert.projectId } : {}),
      resourceType: alert.resourceType,
      viewUrl
    },
    eventKey: ENDPOINT_TRANSFER_VIOLATION_EVENT,
    eventLabel: "Transfer Limit Exceeded",
    webhookType: "com.infisical.endpoint.transfer_violation.tripped",
    resourceKind: "Transfer Limit Violation",
    resourceOwnerKind: "Device",
    // Warning rather than critical, deliberately. The agent measures volume, not intent: it cannot
    // tell a staged exfiltration from someone uploading a large build artifact. Grading every trip
    // critical is how an admin learns to ignore the mail, which costs more than the honest label.
    severity: "warning",
    detailLine:
      targets.length === 1
        ? `${targets[0].deviceName} sent more than its transfer limit allows. The traffic was blocked on the device; review what it was sending and to where.`
        : `${targets.length} devices sent more than their transfer limit allows. The traffic was blocked on each device; review what they were sending and to where.`,
    summary:
      targets.length === 1
        ? `${targets[0].deviceName} exceeded its transfer limit sending to ${targets[0].destination ?? "an unknown destination"}`
        : `${targets.length} transfer limit violations across your devices`,
    items: targets.map((target) => ({
      id: targetId(target),
      title: target.deviceName,
      fields: [
        { label: "Destination", value: target.destination ?? "Unknown" },
        { label: "Sent", value: formatBytes(target.bytesTransferred) },
        { label: "Limit", value: formatBytes(target.thresholdBytes) },
        { label: "Occurred", value: target.occurredAt.toISOString() }
      ]
    }))
  });

  const assertResourceInScope = async (input: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!input.resourceId) return;

    const rule = await endpointTransferViolationAlertDAL.findVolumeRuleInOrg({
      networkRuleId: input.resourceId,
      orgId: input.orgId
    });

    if (!rule) {
      throw new NotFoundError({ message: `Network rule '${input.resourceId}' was not found in this organization` });
    }

    // A destination rule blocks outright and never trips a threshold, so an alert bound to one could
    // never fire. Refusing it here beats letting someone configure silence.
    if (rule.ruleType !== EndpointNetworkRuleType.Volume) {
      throw new BadRequestError({
        message: `Network rule '${rule.name}' blocks a destination rather than capping transfer, so it cannot exceed a transfer limit. Bind this alert to a transfer limit rule instead.`
      });
    }

    if (input.projectId && rule.projectId !== input.projectId) {
      throw new NotFoundError({ message: `Network rule '${input.resourceId}' is not in this project` });
    }
  };

  // The alert module owns no CASL subject, so this reuses Endpoint's own. Read to see the alert,
  // Edit to create, change or delete one — the same right as editing the network policy the alert
  // is about.
  const assertPermission = async (input: TAlertPermissionInput): Promise<void> => {
    if (!input.projectId) return;

    const { permission } = await permissionService.getProjectPermission({
      actor: input.actor.actor,
      actorId: input.actor.actorId,
      projectId: input.projectId,
      actorAuthMethod: input.actor.actorAuthMethod,
      actorOrgId: input.actor.actorOrgId,
      actionProjectType: ActionProjectType.Endpoint
    });

    const action =
      input.action === AlertPermissionAction.Read ? ProjectPermissionActions.Read : ProjectPermissionActions.Edit;

    ForbiddenError.from(permission).throwUnlessCan(action, ProjectPermissionSub.Endpoint);
  };

  return {
    resourceType: ENDPOINT_TRANSFER_VIOLATION_RESOURCE_TYPE,
    eventTypes: [ENDPOINT_TRANSFER_VIOLATION_EVENT],
    conditionSchema: EndpointTransferViolationConditionSchema,
    findDueTargets,
    buildViewUrl,
    buildPayload,
    targetId,
    assertPermission,
    assertResourceInScope
  };
};
