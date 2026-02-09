import { ApprovalPolicyType, ApproverType } from "../approvalPolicies";

export enum ApprovalRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Expired = "expired",
  Cancelled = "cancelled"
}

export enum ApprovalRequestStepStatus {
  Pending = "pending",
  InProgress = "in-progress",
  Completed = "completed",
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
  decision: ApprovalRequestApprovalDecision;
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
  accessDuration: string;
  resourceName?: string;
  accountName?: string;
};

export type CertRequestRequestData = {
  profileId: string;
  profileName: string;
  certificateRequest: {
    commonName?: string;
    organization?: string;
    organizationalUnit?: string;
    country?: string;
    state?: string;
    locality?: string;
    keyUsages?: string[];
    extendedKeyUsages?: string[];
    altNames?: Array<{ type: string; value: string }>;
    validity: { ttl: string };
    notBefore?: string;
    notAfter?: string;
    signatureAlgorithm?: string;
    keyAlgorithm?: string;
    basicConstraints?: {
      isCA: boolean;
      pathLength?: number;
    };
  };
  removeRootsFromChain?: boolean;
  certificateRequestId: string;
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
    requestData: PamAccessRequestData | CertRequestRequestData;
  };
  steps: ApprovalRequestStep[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateApprovalRequestDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
  justification?: string | null;
  requestDuration?: string | null;
  requestData: PamAccessRequestData | CertRequestRequestData;
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

export type TCancelApprovalRequestDTO = {
  policyType: ApprovalPolicyType;
  requestId: string;
};
