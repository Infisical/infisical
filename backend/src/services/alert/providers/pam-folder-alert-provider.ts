import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

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
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { formatDuration, ms } from "@app/lib/ms";
import { ApprovalRequestApprovalDecision } from "@app/services/approval-policy/approval-policy-enums";

import { AlertChannelType, TAlertPayload, TAlertSeverity } from "../alert-channel-types";
import {
  AlertPermissionAction,
  AlertTriggerType,
  IEventAlertProvider,
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
  folderId: string;
  folderName: string;
  accountId: string | null;
  accountName: string | null;
  requesterName: string;
  requesterEmail: string | null;
  requesterUserId: string | null;
  requesterMachineIdentityId: string | null;
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

const toDurationSeconds = (duration?: string) => {
  const durationMs = duration ? ms(duration) : NaN;
  return Number.isFinite(durationMs) ? Math.round(durationMs / 1000) : null;
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
      folderId,
      folderName: folder.name,
      accountId: request.inputs.accountId ?? null,
      accountName: accountNameById.get(request.inputs.accountId ?? "") ?? null,
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail || null,
      requesterUserId: request.requesterId,
      requesterMachineIdentityId: request.machineIdentityId,
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
        ],
        resource: {
          id: target.requestId,
          folderId: target.folderId,
          folderName: target.folderName,
          accountId: target.accountId,
          accountName: target.accountName,
          requesterName: target.requesterName,
          requesterEmail: target.requesterEmail,
          requesterUserId: target.requesterUserId,
          requesterMachineIdentityId: target.requesterMachineIdentityId,
          accessType: target.accessType,
          durationSeconds: toDurationSeconds(target.duration),
          reason: target.reason ?? null,
          reviewerComment: target.comment,
          breakGlassReason: target.bypassReason
        }
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
    if (
      action === AlertPermissionAction.Read &&
      permission.can(ResourcePermissionPamResourceActions.ViewAuditLogs, ResourcePermissionSub.PamResource)
    ) {
      return;
    }
    ForbiddenError.from(permission).throwUnlessCan(
      ResourcePermissionPamResourceActions.ManagePolicies,
      ResourcePermissionSub.PamResource
    );
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
    recipientPolicy: { allowEmailAddresses: true }
  };
};
