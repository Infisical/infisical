import { z } from "zod";

import { Event as TAuditEvent, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { PamAccessType } from "@app/ee/services/pam/pam-enums";
import { checkFolderPermission, verifyProductMembership } from "@app/ee/services/pam/pam-permission";
import {
  PAM_FOLDER_RESOURCE_TYPE,
  PamAccessRequestEvent
} from "@app/ee/services/pam-access-request/pam-access-request-events";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ResourcePermissionPamResourceActions,
  ResourcePermissionSub
} from "@app/ee/services/permission/resource-permission";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { formatDuration } from "@app/lib/ms";
import { ApprovalRequestApprovalDecision } from "@app/services/approval-policy/approval-policy-enums";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import {
  AlertAuditAction,
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
  TAlertAuditInput,
  TAlertContext,
  TAlertPermissionInput,
  TFindEventTargetsInput
} from "../alert-types";
import { TPamFolderAlertDALFactory } from "./pam-folder-alert-dal";

const EventConditionSchema = z.object({}).strict().nullish();

const RequestDataSchema = z.object({
  requestData: z.object({
    accountId: z.string().optional(),
    folderId: z.string(),
    reason: z.string().optional(),
    duration: z.string().optional(),
    accessType: z.nativeEnum(PamAccessType).optional()
  })
});

const EVENT_LABELS: Record<PamAccessRequestEvent, string> = {
  [PamAccessRequestEvent.Requested]: "Request",
  [PamAccessRequestEvent.Approved]: "Approval",
  [PamAccessRequestEvent.Denied]: "Denial",
  [PamAccessRequestEvent.Bypassed]: "Break-Glass"
};

const EVENT_SEVERITY: Record<PamAccessRequestEvent, TAlertSeverity> = {
  [PamAccessRequestEvent.Requested]: "info",
  [PamAccessRequestEvent.Approved]: "info",
  [PamAccessRequestEvent.Denied]: "warning",
  [PamAccessRequestEvent.Bypassed]: "critical"
};

const DECISION_BY_EVENT: Partial<Record<PamAccessRequestEvent, ApprovalRequestApprovalDecision>> = {
  [PamAccessRequestEvent.Approved]: ApprovalRequestApprovalDecision.Approved,
  [PamAccessRequestEvent.Denied]: ApprovalRequestApprovalDecision.Rejected
};

type TPamAccessRequestTarget = {
  requestId: string;
  folderName: string;
  accountName: string | null;
  requesterName: string;
  requesterLabel: string;
  accessType: PamAccessType;
  duration?: string;
  reason?: string;
  comment: string | null;
  bypassReason: string | null;
};

const assertValidFolderId = (folderId: string) => {
  if (!z.string().uuid().safeParse(folderId).success) {
    throw new BadRequestError({ message: `Invalid folder ID '${folderId}': must be a UUID` });
  }
};

const toRequesterLabel = ({
  requesterName,
  requesterEmail,
  machineIdentityId
}: {
  requesterName: string;
  requesterEmail: string;
  machineIdentityId: string | null;
}) => {
  if (machineIdentityId) return `${requesterName} (machine identity)`;
  return requesterEmail ? `${requesterName} (${requesterEmail})` : requesterName;
};

const describeTarget = (eventType: PamAccessRequestEvent, target: TPamAccessRequestTarget) => {
  const account = target.accountName ? `account '${target.accountName}'` : "a deleted account";
  const access = `${target.accessType === PamAccessType.Credential ? "credential access" : "access"} to ${account} in folder '${target.folderName}'`;
  if (eventType === PamAccessRequestEvent.Requested) return `${target.requesterName} requested ${access}`;
  if (eventType === PamAccessRequestEvent.Bypassed) {
    return `${target.requesterName} used break-glass to get ${access} without approval`;
  }
  const decision = eventType === PamAccessRequestEvent.Approved ? "approved" : "denied";
  return `${target.requesterName}'s request for ${access} was ${decision}`;
};

export type TPamFolderAlertProviderDep = {
  pamFolderAlertDAL: TPamFolderAlertDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getResourcePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export const pamFolderAlertProviderFactory = ({
  pamFolderAlertDAL,
  permissionService,
  licenseService
}: TPamFolderAlertProviderDep): IEventAlertProvider<TPamAccessRequestTarget> => {
  // The folder's Approvals tab lists every request, while the approval inbox only shows the visitor's own queue.
  const buildViewUrl = async (alert: TAlertContext): Promise<string> =>
    `${getConfig().SITE_URL}/organizations/${alert.orgId}/pam/accounts?folderId=${alert.resourceId}&tab=approvals`;

  const findEventTargets = async (input: TFindEventTargetsInput): Promise<TPamAccessRequestTarget[]> => {
    if (!input.projectId || !input.resourceId) return [];
    EventConditionSchema.parse(input.condition);

    const eventType = input.eventType as PamAccessRequestEvent;
    const folderId = input.resourceId;
    const requests = (
      await pamFolderAlertDAL.findAccessRequestsByIds({
        orgId: input.orgId,
        projectId: input.projectId,
        requestIds: input.targetIds
      })
    ).flatMap((request) => {
      const parsed = RequestDataSchema.safeParse(request.requestData);
      return parsed.success && parsed.data.requestData.folderId === folderId
        ? [{ ...request, inputs: parsed.data.requestData }]
        : [];
    });
    if (requests.length === 0) return [];

    const requestIds = requests.map((request) => request.id);
    const decision = DECISION_BY_EVENT[eventType];
    const [folder, accounts, decisions, grants] = await Promise.all([
      pamFolderAlertDAL.findFolderById(folderId, { readFromPrimary: true }),
      pamFolderAlertDAL.findAccountNamesByIds({
        projectId: input.projectId,
        accountIds: requests.flatMap((request) => (request.inputs.accountId ? [request.inputs.accountId] : []))
      }),
      decision ? pamFolderAlertDAL.findDecisionCommentsByRequestIds({ requestIds, decision }) : [],
      eventType === PamAccessRequestEvent.Bypassed ? pamFolderAlertDAL.findBypassReasonsByRequestIds(requestIds) : []
    ]);
    if (!folder) return [];

    const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
    // Rows come back oldest first, so the last decision per request wins.
    const commentByRequestId = new Map(decisions.map((row) => [row.requestId, row.comment]));
    const bypassReasonByRequestId = new Map(grants.map((row) => [row.requestId, row.bypassReason]));

    return requests.map((request) => ({
      requestId: request.id,
      folderName: folder.name,
      accountName: accountNameById.get(request.inputs.accountId ?? "") ?? null,
      requesterName: request.requesterName,
      requesterLabel: toRequesterLabel(request),
      accessType: request.inputs.accessType ?? PamAccessType.Session,
      duration: request.inputs.duration,
      reason: request.inputs.reason,
      comment: commentByRequestId.get(request.id) || null,
      bypassReason: bypassReasonByRequestId.get(request.id) || null
    }));
  };

  const buildPayload = (alert: TAlertContext, targets: TPamAccessRequestTarget[], viewUrl: string): TAlertPayload => {
    const eventType = alert.eventType as PamAccessRequestEvent;

    return {
      alert: {
        id: alert.id,
        name: alert.name,
        orgId: alert.orgId,
        ...(alert.projectId ? { projectId: alert.projectId } : {}),
        resourceType: alert.resourceType,
        ...(alert.resourceId ? { resourceId: alert.resourceId } : {}),
        viewUrl
      },
      eventKey: eventType,
      eventLabel: EVENT_LABELS[eventType],
      webhookType: `com.infisical.${eventType}`,
      resourceKind: "PAM Access",
      resourceOwnerKind: "Folder",
      severity: EVENT_SEVERITY[eventType],
      summary: describeTarget(eventType, targets[0]),
      items: targets.map((target) => ({
        id: target.requestId,
        title: target.accountName ?? "Deleted account",
        summary: describeTarget(eventType, target),
        fields: [
          { label: "Requester", value: target.requesterLabel },
          { label: "Folder", value: target.folderName },
          { label: "Access Type", value: target.accessType === PamAccessType.Credential ? "Credentials" : "Session" },
          ...(target.duration ? [{ label: "Duration", value: formatDuration(target.duration) }] : []),
          ...(target.reason ? [{ label: "Reason", value: target.reason }] : []),
          ...(target.comment ? [{ label: "Reviewer Comment", value: target.comment }] : []),
          ...(target.bypassReason && target.bypassReason !== target.reason
            ? [{ label: "Break-Glass Reason", value: target.bypassReason }]
            : [])
        ]
      }))
    };
  };

  const assertResourceInScope = async ({
    orgId,
    projectId,
    resourceId
  }: {
    orgId: string;
    projectId?: string | null;
    resourceId?: string | null;
  }): Promise<void> => {
    if (!resourceId) return;
    assertValidFolderId(resourceId);

    const folder = await pamFolderAlertDAL.findFolderById(resourceId);
    if (!folder || folder.orgId !== orgId || folder.projectId !== projectId) {
      throw new NotFoundError({ message: `PAM folder with ID '${resourceId}' not found` });
    }
  };

  const assertPermission = async ({
    action,
    orgId,
    projectId,
    resourceId,
    actor
  }: TAlertPermissionInput): Promise<void> => {
    if (!projectId || !resourceId) {
      throw new BadRequestError({ message: "PAM folder alerts require the PAM project ID and a folder ID" });
    }

    await verifyProductMembership(permissionService, projectId, actor);
    await assertResourceInScope({ orgId, projectId, resourceId });

    const { permission } = await checkFolderPermission(permissionService, resourceId, projectId, actor);
    const isRead = action === AlertPermissionAction.Read;
    if (
      permission.can(ResourcePermissionPamResourceActions.ManagePolicies, ResourcePermissionSub.PamResource) ||
      (isRead && permission.can(ResourcePermissionPamResourceActions.ViewAuditLogs, ResourcePermissionSub.PamResource))
    ) {
      return;
    }

    throw new ForbiddenRequestError({
      message: isRead
        ? "You need permission to manage approvals or view audit logs on this folder to see its alerts"
        : "You need permission to manage approvals on this folder to change its alerts"
    });
  };

  const assertChannelTypesAllowed = async ({ orgId, channelTypes }: { orgId: string; channelTypes: string[] }) => {
    const gatedType = channelTypes.find((channelType) => channelType !== AlertChannelType.EMAIL);
    if (!gatedType) return;

    const plan = await licenseService.getPlan(orgId);
    if (!plan.pamEnterpriseAlerting) {
      throw new BadRequestError({
        message: `Failed to add a ${gatedType} channel due to plan restriction. Upgrade plan to send PAM alerts to channels other than email.`
      });
    }
  };

  const getAuditEvent = (input: TAlertAuditInput): TAuditEvent => {
    if (input.action === AlertAuditAction.TestChannel) {
      const { test } = input;
      return {
        type: EventType.PAM_FOLDER_ALERT_CHANNEL_TEST,
        metadata: {
          ...(test.resourceId ? { folderId: test.resourceId } : {}),
          folderName: test.resourceName ?? null,
          alertId: test.alertId,
          alertName: test.alertName ?? null,
          channelId: test.channelId,
          channelName: test.channelName ?? null,
          channelType: test.channelType,
          success: test.success,
          deliveredTo: test.deliveredTo,
          error: test.error
        }
      };
    }

    const metadata = {
      ...(input.alert.resourceId ? { folderId: input.alert.resourceId } : {}),
      folderName: input.alert.resourceName ?? null,
      alertId: input.alert.id,
      name: input.alert.name,
      eventType: input.alert.eventType
    };
    if (input.action === AlertAuditAction.Create) return { type: EventType.PAM_FOLDER_ALERT_CREATE, metadata };
    if (input.action === AlertAuditAction.Update) return { type: EventType.PAM_FOLDER_ALERT_UPDATE, metadata };
    return { type: EventType.PAM_FOLDER_ALERT_DELETE, metadata };
  };

  return {
    resourceType: PAM_FOLDER_RESOURCE_TYPE,
    events: Object.values(PamAccessRequestEvent).map((key) => ({
      key,
      triggerType: AlertTriggerType.Event,
      conditionSchema: EventConditionSchema
    })),
    findEventTargets,
    buildViewUrl,
    buildPayload,
    targetId: (target) => target.requestId,
    assertPermission,
    assertResourceInScope,
    assertChannelTypesAllowed,
    getAuditEvent,
    getResourceNames: async ({ orgId, resourceIds }) =>
      new Map(
        (await pamFolderAlertDAL.findFolderNamesByIds({ orgId, folderIds: resourceIds })).map((folder) => [
          folder.id,
          folder.name
        ])
      )
  };
};
