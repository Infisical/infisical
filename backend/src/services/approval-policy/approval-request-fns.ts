import { Knex } from "knex";

import { TApprovalRequests } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType
} from "./approval-policy-enums";
import { ApprovalPolicyStep, TApprovalRequestData } from "./approval-policy-types";
import {
  TApprovalRequestDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "./approval-request-dal";

export interface TCreateApprovalRequestWithStepsParams {
  projectId: string;
  organizationId: string;
  policyId: string;
  policyType: ApprovalPolicyType;
  policySteps: ApprovalPolicyStep[];
  requestData: TApprovalRequestData;
  justification?: string | null;
  expiresAt?: Date | null;
  requesterUserId?: string | null;
  machineIdentityId?: string | null;
  requesterName: string;
  requesterEmail: string;
  scopeType?: string | null;
  scopeId?: string | null;
}

export type TApprovalRequestWithSteps = TApprovalRequests & {
  steps: Array<{
    id: string;
    requestId: string;
    stepNumber: number;
    name: string | null;
    status: string;
    requiredApprovals: number;
    notifyApprovers?: boolean | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
    approvers: Array<{ type: ApproverType; id: string }>;
    approvals: Array<unknown>;
  }>;
};

export const createApprovalRequestWithSteps = async (
  {
    projectId,
    organizationId,
    policyId,
    policyType,
    policySteps,
    requestData,
    justification,
    expiresAt,
    requesterUserId,
    machineIdentityId,
    requesterName,
    requesterEmail,
    scopeType,
    scopeId
  }: TCreateApprovalRequestWithStepsParams,
  dependencies: {
    approvalRequestDAL: Pick<TApprovalRequestDALFactory, "create" | "transaction">;
    approvalRequestStepsDAL: Pick<TApprovalRequestStepsDALFactory, "create">;
    approvalRequestStepEligibleApproversDAL: Pick<TApprovalRequestStepEligibleApproversDALFactory, "create">;
  },
  externalTx?: Knex
): Promise<TApprovalRequestWithSteps> => {
  const { approvalRequestDAL, approvalRequestStepsDAL, approvalRequestStepEligibleApproversDAL } = dependencies;

  const createRequestAndSteps = async (tx: Knex) => {
    const newRequest = await approvalRequestDAL.create(
      {
        projectId,
        organizationId,
        policyId,
        requesterId: requesterUserId ?? null,
        machineIdentityId: machineIdentityId ?? null,
        requesterName,
        requesterEmail,
        type: policyType,
        status: ApprovalRequestStatus.Pending,
        justification,
        currentStep: 1,
        requestData: { version: 1, requestData },
        expiresAt,
        scopeType: scopeType ?? null,
        scopeId: scopeId ?? null
      },
      tx
    );

    const newSteps = await Promise.all(
      policySteps.map(async (step, i) => {
        const stepNum = i + 1;
        const newStep = await approvalRequestStepsDAL.create(
          {
            requestId: newRequest.id,
            stepNumber: stepNum,
            name: step.name ?? null,
            status: stepNum === 1 ? ApprovalRequestStepStatus.InProgress : ApprovalRequestStepStatus.Pending,
            requiredApprovals: step.requiredApprovals,
            notifyApprovers: step.notifyApprovers ?? false,
            startedAt: stepNum === 1 ? new Date() : null
          },
          tx
        );

        await Promise.all(
          step.approvers.map((approver) =>
            approvalRequestStepEligibleApproversDAL.create(
              {
                stepId: newStep.id,
                userId: approver.type === ApproverType.User ? approver.id : null,
                groupId: approver.type === ApproverType.Group ? approver.id : null
              },
              tx
            )
          )
        );

        return {
          ...newStep,
          approvers: step.approvers,
          approvals: []
        };
      })
    );

    return { request: newRequest, steps: newSteps };
  };

  const { request, steps } = externalTx
    ? await createRequestAndSteps(externalTx)
    : await approvalRequestDAL.transaction(createRequestAndSteps);

  return { ...request, steps } as TApprovalRequestWithSteps;
};

export const resolveStepApproverUserIds = async (
  step: ApprovalPolicyStep,
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">
): Promise<Set<string>> => {
  const userIds = new Set<string>();

  for await (const approver of step.approvers) {
    if (approver.type === ApproverType.User) {
      userIds.add(approver.id);
    } else if (approver.type === ApproverType.Group) {
      const members = await userGroupMembershipDAL.find({ groupId: approver.id });
      members.forEach((member) => userIds.add(member.userId));
    }
  }

  return userIds;
};

export const notifyApproversForStep = async (
  step: ApprovalPolicyStep,
  request: TApprovalRequests,
  dependencies: {
    userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
    notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  },
  preResolvedApproverUserIds?: Set<string>
): Promise<void> => {
  const { userGroupMembershipDAL, notificationService } = dependencies;
  const userIdsToNotify =
    preResolvedApproverUserIds ?? (await resolveStepApproverUserIds(step, userGroupMembershipDAL));

  if (userIdsToNotify.size === 0) return;

  await notificationService.createUserNotifications(
    Array.from(userIdsToNotify).map((userId) => ({
      userId,
      orgId: request.organizationId,
      type: NotificationType.APPROVAL_REQUIRED,
      title: "Approval Required",
      body: `You have a new approval request for ${request.type} from ${request.requesterName}.`
    }))
  );
};

export const sendApprovalEmailsForStep = async (
  step: ApprovalPolicyStep,
  request: TApprovalRequests,
  emailContext: {
    requestTypeLabel: string;
    projectName: string;
    approvalUrl: string;
  },
  dependencies: {
    userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
    userDAL: Pick<TUserDALFactory, "find">;
    smtpService: Pick<TSmtpService, "sendMail">;
  },
  preResolvedApproverUserIds?: Set<string>
): Promise<void> => {
  const { userGroupMembershipDAL, userDAL, smtpService } = dependencies;
  const approverUserIds =
    preResolvedApproverUserIds ?? (await resolveStepApproverUserIds(step, userGroupMembershipDAL));

  if (approverUserIds.size === 0) return;

  const approverUsers = await userDAL.find({ $in: { id: Array.from(approverUserIds) } });
  const recipients = approverUsers.filter((user) => user.email).map((user) => user.email as string);

  if (recipients.length === 0) return;

  await smtpService.sendMail({
    recipients,
    subjectLine: "Approval Request",
    template: SmtpTemplates.ApprovalRequestNeedsReview,
    substitutions: {
      requesterName: request.requesterName,
      requesterEmail: request.requesterEmail || undefined,
      requestType: emailContext.requestTypeLabel,
      projectName: emailContext.projectName,
      justification: request.justification || undefined,
      approvalUrl: emailContext.approvalUrl
    }
  });
};

export const notifyStepApprovers = async (
  step: ApprovalPolicyStep,
  request: TApprovalRequests,
  dependencies: {
    userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
    notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
    userDAL: Pick<TUserDALFactory, "find">;
    smtpService: Pick<TSmtpService, "sendMail">;
    projectDAL: Pick<TProjectDALFactory, "findById">;
  }
): Promise<void> => {
  const { userGroupMembershipDAL, notificationService, userDAL, smtpService, projectDAL } = dependencies;

  const approverUserIds = await resolveStepApproverUserIds(step, userGroupMembershipDAL);

  await notifyApproversForStep(step, request, { userGroupMembershipDAL, notificationService }, approverUserIds);

  if (request.type !== ApprovalPolicyType.CertRequest && request.type !== ApprovalPolicyType.CertCodeSigning) {
    return;
  }

  const cfg = getConfig();
  // skip email when SITE_URL is unset, the review link would dead-link
  if (!cfg.SITE_URL) return;

  try {
    const project = await projectDAL.findById(request.projectId);
    const approvalUrl = `${cfg.SITE_URL}/organizations/${request.organizationId}/projects/cert-manager/${request.projectId}/approvals/${request.id}?policyType=${encodeURIComponent(request.type)}`;

    await sendApprovalEmailsForStep(
      step,
      request,
      {
        requestTypeLabel:
          request.type === ApprovalPolicyType.CertCodeSigning ? "code signing request" : "certificate request",
        projectName: project?.name ?? "Unknown project",
        approvalUrl
      },
      { userGroupMembershipDAL, userDAL, smtpService },
      approverUserIds
    );
  } catch (err) {
    logger.error(err, `Failed to send approval request emails to approvers [requestId=${request.id}]`);
  }
};
