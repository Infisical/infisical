import { Knex } from "knex";

import { TApprovalRequests } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TNotificationServiceFactory } from "@app/services/notification/notification-service";
import { NotificationType } from "@app/services/notification/notification-types";

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
    requesterEmail
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
        expiresAt
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

export const notifyApproversForStep = async (
  step: ApprovalPolicyStep,
  request: TApprovalRequests,
  dependencies: {
    userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "find">;
    notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  }
): Promise<void> => {
  if (!step.notifyApprovers) return;

  const { userGroupMembershipDAL, notificationService } = dependencies;
  const userIdsToNotify = new Set<string>();

  for await (const approver of step.approvers) {
    if (approver.type === ApproverType.User) {
      userIdsToNotify.add(approver.id);
    } else if (approver.type === ApproverType.Group) {
      const members = await userGroupMembershipDAL.find({ groupId: approver.id });
      members.forEach((member) => userIdsToNotify.add(member.userId));
    }
  }

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
