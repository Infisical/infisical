import { Knex } from "knex";

import { TApprovalRequests } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";

import {
  ApprovalPolicyType,
  ApprovalRequestStatus,
  ApprovalRequestStepStatus,
  ApproverType
} from "./approval-policy-enums";
import { ApprovalPolicyStep, TApprovalRequestData, TApprovalRequestSubjectMetadata } from "./approval-policy-types";
import {
  TApprovalRequestDALFactory,
  TApprovalRequestStepEligibleApproversDALFactory,
  TApprovalRequestStepsDALFactory
} from "./approval-request-dal";
import { TCertRequestRequestData } from "./cert-request/cert-request-policy-types";
import { TCodeSigningRequestData } from "./code-signing/code-signing-policy-types";

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

export const getApprovalRequestSubjectMetadata = (
  request: Pick<TApprovalRequests, "type" | "requestData">
): TApprovalRequestSubjectMetadata => {
  const requestData = (request.requestData as { requestData?: unknown } | null)?.requestData;
  if (!requestData) return {};

  if (request.type === ApprovalPolicyType.CertRequest) {
    const { certificateRequestId, certificateRequest, profileName } = requestData as TCertRequestRequestData;
    return { certificateRequestId, commonName: certificateRequest?.commonName, profileName };
  }

  if (request.type === ApprovalPolicyType.CertCodeSigning) {
    const { signerId, signerName } = requestData as TCodeSigningRequestData;
    return { signerId, signerName };
  }

  return {};
};
