import { ApprovalPolicyType } from "../approvalPolicies";
import { CertRequestRequestData } from "../approvalRequests";

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

export type CertRequestGrantAttributes = CertRequestRequestData;

export type TApprovalGrantAttributes = PamAccessGrantAttributes | CertRequestGrantAttributes;

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
  attributes: TApprovalGrantAttributes;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export const isCertRequestGrant = (
  grant: TApprovalGrant
): grant is TApprovalGrant & { attributes: CertRequestGrantAttributes } => {
  return grant.type === ApprovalPolicyType.CertRequest;
};

export const isPamAccessGrant = (
  grant: TApprovalGrant
): grant is TApprovalGrant & { attributes: PamAccessGrantAttributes } => {
  return grant.type === ApprovalPolicyType.PamAccess;
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
