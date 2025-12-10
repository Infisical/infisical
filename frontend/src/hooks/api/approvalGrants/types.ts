import { ApprovalPolicyType } from "../approvalPolicies";

export enum ApprovalGrantStatus {
  Active = "active",
  Expired = "expired",
  Revoked = "revoked"
}

// PAM Access Grant Attributes
export type PamAccessGrantAttributes = {
  accountPath: string;
  accessDuration: string;
};

// Base Grant Type
export type TApprovalGrant = {
  id: string;
  projectId: string;
  requestId: string | null;
  granteeUserId: string | null;
  revokedByUserId: string | null;
  revocationReason: string | null;
  status: ApprovalGrantStatus;
  type: ApprovalPolicyType;
  attributes: PamAccessGrantAttributes;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

// DTOs
export type TListApprovalGrantsDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
};

export type TGetApprovalGrantByIdDTO = {
  policyType: ApprovalPolicyType;
  grantId: string;
};

export type TRevokeApprovalGrantDTO = {
  policyType: ApprovalPolicyType;
  grantId: string;
  revocationReason?: string;
};
