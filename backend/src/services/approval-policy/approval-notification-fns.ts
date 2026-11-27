import { TApprovalRequests } from "@app/db/schemas";
import { TChatDeliveryService } from "@app/domains/platform/workflow-integrations/ce/module";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ApprovalNotificationEvent, ApprovalPolicyType, ApproverType } from "./approval-policy-enums";
import { TApprovalNotification, TApprovalResource } from "./approval-policy-types";

const SELF_APPROVAL_BLOCKED_TYPES = new Set([ApprovalPolicyType.PamAccess, ApprovalPolicyType.CertCodeSigning]);

export type TApprovalNotificationDeps = {
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "find">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  chatDeliveryService: Pick<TChatDeliveryService, "post">;
};

export const expandApproversToUserIds = async (
  approvers: { type: ApproverType; id: string }[],
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">
) => {
  const userIds = new Set(approvers.filter((a) => a.type === ApproverType.User).map((a) => a.id));

  const groupMembers = await Promise.all(
    approvers.filter((a) => a.type === ApproverType.Group).map((a) => userGroupMembershipDAL.find({ groupId: a.id }))
  );
  groupMembers.forEach((members) => members.forEach((m) => userIds.add(m.userId)));

  return userIds;
};

const resolveRecipients = async (
  event: ApprovalNotificationEvent,
  request: TApprovalRequests,
  approvers: { type: ApproverType; id: string }[],
  actorId: string | undefined,
  { userGroupMembershipDAL }: Pick<TApprovalNotificationDeps, "userGroupMembershipDAL">
) => {
  if (event === ApprovalNotificationEvent.Approved || event === ApprovalNotificationEvent.Rejected) {
    return request.requesterId ? new Set([request.requesterId]) : new Set<string>();
  }

  if (event === ApprovalNotificationEvent.ApprovedActionFailed) {
    const userIds = await expandApproversToUserIds(approvers, userGroupMembershipDAL);
    if (request.requesterId) userIds.add(request.requesterId);
    return userIds;
  }

  const userIds = await expandApproversToUserIds(approvers, userGroupMembershipDAL);
  if (actorId) userIds.delete(actorId);
  if (
    event === ApprovalNotificationEvent.Requested &&
    request.requesterId &&
    SELF_APPROVAL_BLOCKED_TYPES.has(request.type as ApprovalPolicyType)
  ) {
    userIds.delete(request.requesterId);
  }
  return userIds;
};

const deliverToUsers = async (
  content: TApprovalNotification,
  recipientIds: Set<string>,
  request: TApprovalRequests,
  { userDAL, notificationService, smtpService }: TApprovalNotificationDeps
) => {
  if (recipientIds.size === 0) return;

  if (content.inApp) {
    await notificationService.createUserNotifications(
      [...recipientIds].map((userId) => ({ userId, orgId: request.organizationId, ...content.inApp! }))
    );
  }

  if (content.email) {
    const users = await userDAL.find({ $in: { id: [...recipientIds] } });
    const recipients = users.map((user) => user.email).filter((email): email is string => Boolean(email));
    if (recipients.length > 0) {
      await smtpService.sendMail({ recipients, ...content.email });
    }
  }
};

const deliverToChat = async (
  content: TApprovalNotification,
  request: TApprovalRequests,
  { chatDeliveryService }: TApprovalNotificationDeps
) => {
  for (const delivery of content.chat ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const result = await chatDeliveryService.post({
      orgId: request.organizationId,
      integrationId: delivery.workflowIntegrationId,
      channelIds: delivery.channelIds,
      message: delivery.message
    });
    if (!result.integrationMissing) {
      result.channels
        .filter((channel) => !channel.delivered)
        .forEach((channel) =>
          logger.error(
            { requestId: request.id, channelId: channel.channelId, failure: channel.failure },
            `Failed to post approval notification to chat channel [requestId=${request.id}] [channelId=${channel.channelId}]`
          )
        );
    }
  }
};

export const dispatchApprovalNotification = async (
  {
    event,
    request,
    resource,
    approvers,
    actorId,
    comment,
    bypassReason,
    failureReason
  }: {
    event: ApprovalNotificationEvent;
    request: TApprovalRequests;
    resource: TApprovalResource;
    approvers: { type: ApproverType; id: string }[];
    actorId?: string;
    comment?: string;
    bypassReason?: string;
    failureReason?: string;
  },
  deps: TApprovalNotificationDeps
) => {
  if (!resource.buildNotification) return;

  try {
    const eligibleApprovers = resource.filterActiveApprovers
      ? await resource.filterActiveApprovers(request, approvers)
      : approvers;

    const content = await resource.buildNotification({ event, request, comment, bypassReason, failureReason });
    if (!content) return;

    const recipientIds = await resolveRecipients(event, request, eligibleApprovers, actorId, deps);
    await deliverToUsers(content, recipientIds, request, deps);
    await deliverToChat(content, request, deps);
  } catch (err) {
    logger.error(
      { err, requestId: request.id, event },
      `Failed to deliver approval notifications [requestId=${request.id}] [event=${event}]`
    );
  }
};
