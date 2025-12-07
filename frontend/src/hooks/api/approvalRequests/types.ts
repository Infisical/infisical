import { ApprovalPolicyType, ApproverType } from "../approvalPolicies";

export enum ApprovalRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired"
}

export enum ApprovalRequestStepStatus {
  Pending = "pending",
  InProgress = "in-progress",
  Approved = "approved",
  Rejected = "rejected"
}

export enum ApprovalRequestApprovalDecision {
  Approved = "approved",
  Rejected = "rejected"
}

export type ApprovalRequestApproval = {
  id: string;
  stepId: string;
  approverUserId: string;
  decision: ApprovalRequestApprovalDecision.Approved;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRequestStep = {
  id: string;
  requestId: string;
  name?: string | null;
  requiredApprovals: number;
  notifyApprovers?: boolean | null;
  stepNumber: number;
  status: ApprovalRequestStepStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  approvers: {
    type: ApproverType;
    id: string;
  }[];
  approvals: ApprovalRequestApproval[];
  createdAt: string;
  updatedAt: string;
};

export type PamAccessRequestData = {
  resourceId: string;
  accountPath: string;
  requestDurationSeconds: number;
};

export type TApprovalRequest = {
  id: string;
  projectId: string;
  policyId: string;
  type: ApprovalPolicyType;
  status: ApprovalRequestStatus;
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  justification?: string | null;
  expiresAt?: string | null;
  requestData: {
    version: number;
    requestData: PamAccessRequestData;
  };
  steps: ApprovalRequestStep[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateApprovalRequestDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
  justification?: string | null;
  expiresAt?: Date | null;
  requestData: PamAccessRequestData;
};

export type TGetApprovalRequestByIdDTO = {
  policyType: ApprovalPolicyType;
  requestId: string;
};

export type TListApprovalRequestsDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
};

export type TApproveApprovalRequestDTO = {
  policyType: ApprovalPolicyType;
  requestId: string;
  comment?: string;
};

export type TRejectApprovalRequestDTO = {
  policyType: ApprovalPolicyType;
  requestId: string;
  comment?: string;
};
