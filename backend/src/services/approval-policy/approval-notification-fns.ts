import { TApprovalRequests } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { sendSlackNotification } from "@app/services/slack/slack-fns";
import { TSlackIntegrationDALFactory } from "@app/services/slack/slack-integration-dal";
import { TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { ApprovalNotificationEvent, ApproverType } from "./approval-policy-enums";
import { TApprovalNotification, TApprovalResource } from "./approval-policy-types";

export type TApprovalNotificationDeps = {
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
  userDAL: Pick<TUserDALFactory, "find">;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  smtpService: Pick<TSmtpService, "sendMail">;
  slackIntegrationDAL: Pick<TSlackIntegrationDALFactory, "findByIdWithWorkflowIntegrationDetails">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
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

  const userIds = await expandApproversToUserIds(approvers, userGroupMembershipDAL);
  if (actorId) userIds.delete(actorId);
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
  { slackIntegrationDAL, kmsService }: TApprovalNotificationDeps
) => {
  for (const delivery of content.chat ?? []) {
    // eslint-disable-next-line no-await-in-loop
    const slackIntegration = await slackIntegrationDAL.findByIdWithWorkflowIntegrationDetails(
      delivery.workflowIntegrationId
    );
    if (slackIntegration) {
      // eslint-disable-next-line no-await-in-loop
      await sendSlackNotification({
        orgId: request.organizationId,
        notification: delivery.notification,
        kmsService,
        targetChannelIds: delivery.channelIds,
        slackIntegration
      });
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
    bypassReason
  }: {
    event: ApprovalNotificationEvent;
    request: TApprovalRequests;
    resource: TApprovalResource;
    approvers: { type: ApproverType; id: string }[];
    actorId?: string;
    comment?: string;
    bypassReason?: string;
  },
  deps: TApprovalNotificationDeps
) => {
  if (!resource.buildNotification) return;

  try {
    const eligibleApprovers = resource.filterActiveApprovers
      ? await resource.filterActiveApprovers(request, approvers)
      : approvers;

    const content = await resource.buildNotification({ event, request, comment, bypassReason });
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
