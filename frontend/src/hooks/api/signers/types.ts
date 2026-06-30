import { CaType } from "@app/hooks/api/ca/enums";

export type TGetUserSignerPermissionDTO = {
  signerId: string;
};

export type TSignerExternalConfiguration = {
  caType: CaType.DIGICERT;
  reissueFromExternalOrderId?: string;
};

export enum SignerStatus {
  Pending = "pending",
  Active = "active",
  Failed = "failed",
  Disabled = "disabled",
  Expired = "expired"
}

export enum SignerKeyAlgorithm {
  RSA_2048 = "RSA_2048",
  RSA_3072 = "RSA_3072",
  RSA_4096 = "RSA_4096",
  ECDSA_P256 = "EC_prime256v1",
  ECDSA_P384 = "EC_secp384r1",
  ECDSA_P521 = "EC_secp521r1"
}

export enum CertKeySource {
  Infisical = "infisical",
  Hsm = "hsm"
}

export const HSM_SUPPORTED_KEY_ALGORITHMS: readonly SignerKeyAlgorithm[] = [
  SignerKeyAlgorithm.RSA_2048,
  SignerKeyAlgorithm.RSA_4096,
  SignerKeyAlgorithm.ECDSA_P256,
  SignerKeyAlgorithm.ECDSA_P384
];

export const signerKeyAlgorithmLabels: Record<SignerKeyAlgorithm, string> = {
  [SignerKeyAlgorithm.RSA_2048]: "RSA-2048",
  [SignerKeyAlgorithm.RSA_3072]: "RSA-3072",
  [SignerKeyAlgorithm.RSA_4096]: "RSA-4096",
  [SignerKeyAlgorithm.ECDSA_P256]: "ECDSA P-256",
  [SignerKeyAlgorithm.ECDSA_P384]: "ECDSA P-384",
  [SignerKeyAlgorithm.ECDSA_P521]: "ECDSA P-521"
};

export const signerStatusLabels: Record<SignerStatus, string> = {
  [SignerStatus.Pending]: "Pending",
  [SignerStatus.Active]: "Active",
  [SignerStatus.Failed]: "Failed",
  [SignerStatus.Disabled]: "Disabled",
  [SignerStatus.Expired]: "Expired"
};

export const getSignerStatusBadgeVariant = (status: SignerStatus) => {
  switch (status) {
    case SignerStatus.Active:
      return "success" as const;
    case SignerStatus.Pending:
      return "warning" as const;
    case SignerStatus.Failed:
      return "danger" as const;
    case SignerStatus.Expired:
      return "danger" as const;
    case SignerStatus.Disabled:
      return "neutral" as const;
    default:
      return "neutral" as const;
  }
};

export enum SigningOperationStatus {
  Pending = "pending",
  Success = "success",
  Failed = "failed",
  Denied = "denied"
}

export const signingOperationStatusLabels: Record<SigningOperationStatus, string> = {
  [SigningOperationStatus.Pending]: "Pending",
  [SigningOperationStatus.Success]: "Success",
  [SigningOperationStatus.Failed]: "Failed",
  [SigningOperationStatus.Denied]: "Denied"
};

export type TSigner = {
  id: string;
  projectId: string;
  name: string;
  description?: string | null;
  status: SignerStatus;
  certificateId?: string | null;
  approvalPolicyId?: string | null;
  caId?: string | null;
  commonName?: string | null;
  certificateTtlDays?: number | null;
  certificateRenewBeforeDays?: number | null;
  keyAlgorithm?: SignerKeyAlgorithm | string | null;
  lastSignedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  certificateCommonName?: string | null;
  certificateSerialNumber?: string | null;
  certificateNotAfter?: string | null;
  certificateKeySource?: CertKeySource | string | null;
  certificateHsmConnectorId?: string | null;
  approvalPolicyName?: string | null;
  certificateFailureReason?: string | null;
};

export enum SigningActorType {
  User = "user",
  Identity = "identity"
}

export type TSigningOperation = {
  id: string;
  signerId: string;
  projectId: string;
  status: SigningOperationStatus;
  signingAlgorithm: string;
  dataHash: string;
  actorType: SigningActorType;
  actorId: string;
  actorName?: string | null;
  actorMembershipId?: string | null;
  approvalGrantId?: string | null;
  clientMetadata?: {
    tool?: string;
    hostname?: string;
    reportedIp?: string;
  } | null;
  errorMessage?: string | null;
  createdAt: string;
};

export enum SignerMemberRole {
  Administrator = "admin",
  Operator = "operator",
  Auditor = "auditor"
}

export const signerMemberRoleLabels: Record<SignerMemberRole, string> = {
  [SignerMemberRole.Administrator]: "Administrator",
  [SignerMemberRole.Operator]: "Operator",
  [SignerMemberRole.Auditor]: "Auditor"
};

export const signerMemberRoleDescriptions: Record<SignerMemberRole, string> = {
  [SignerMemberRole.Administrator]: "Manage members, approval policy, and settings.",
  [SignerMemberRole.Operator]: "Sign artifacts and submit signing requests for this signer.",
  [SignerMemberRole.Auditor]: "View members, activity, and the audit log for this signer."
};

export type TSignerMember = {
  membershipId: string;
  signerId: string;
  actorUserId?: string | null;
  actorIdentityId?: string | null;
  actorGroupId?: string | null;
  role: string;
  customRoleId?: string | null;
  createdAt: string;
  updatedAt: string;
  details?: {
    name: string | null;
    email?: string | null;
    username?: string | null;
    authMethod?: string | null;
    slug?: string | null;
  } | null;
};

export type TSignerPolicyStep = {
  requiredApprovals: number;
  approvers: { type: "user" | "group"; id: string }[];
  name?: string | null;
  stepNumber?: number;
};

export type TSignerPolicy = {
  id: string;
  signerId: string;
  hasSteps: boolean;
  steps: TSignerPolicyStep[];
  constraints: {
    maxSignings: number | null;
    maxWindowDuration: string | null;
  };
};

export enum SignerRequestStatus {
  Pending = "pending",
  Approved = "approved",
  Rejected = "rejected",
  Cancelled = "cancelled",
  Expired = "expired"
}

export type TSignerRequest = {
  id: string;
  projectId: string;
  organizationId: string;
  policyId: string;
  requesterId?: string | null;
  machineIdentityId?: string | null;
  requesterName: string;
  requesterEmail: string;
  type: string;
  status: SignerRequestStatus;
  justification?: string | null;
  currentStep: number;
  requestData: unknown;
  expiresAt?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  maxSignings?: number | null;
  usedSignings?: number;
  grantStatus?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TListSignersDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  search?: string;
};

export type TListSignersResponse = {
  signers: TSigner[];
  totalCount: number;
};

export type TCreateSignerMemberInput = {
  kind: "user" | "identity" | "group";
  id: string;
  role: SignerMemberRole;
};

export type TCreateSignerApprovalPolicyInput = {
  steps: {
    stepNumber: number;
    name?: string | null;
    requiredApprovals: number;
    approverUserIds: string[];
    approverGroupIds?: string[];
  }[];
  constraints?: { maxSignings?: number | null; maxWindowDuration?: string | null };
};

export type TSignerCertificateInput = {
  keySource?: CertKeySource;
  hsmConnectorId?: string;
};

export type TCreateSignerDTO = {
  projectId: string;
  name: string;
  description?: string;
  caId?: string;
  commonName?: string;
  certificateTtlDays?: number;
  certificateRenewBeforeDays?: number | null;
  keyAlgorithm?: SignerKeyAlgorithm;
  certificateId?: string;
  approvalPolicyId?: string;
  members?: TCreateSignerMemberInput[];
  approvalPolicy?: TCreateSignerApprovalPolicyInput;
  certificate?: TSignerCertificateInput;
  externalConfiguration?: TSignerExternalConfiguration;
};

export type TUpdateSignerDTO = {
  signerId: string;
  name?: string;
  description?: string | null;
  certificateRenewBeforeDays?: number | null;
};

export type TDeleteSignerDTO = {
  signerId: string;
};

export type TReissueSignerCertificateDTO = {
  signerId: string;
  caId: string;
  commonName?: string;
  certificateTtlDays?: number;
  keyAlgorithm?: SignerKeyAlgorithm;
  certificate?: {
    keySource: CertKeySource;
    hsmConnectorId?: string;
  };
  externalConfiguration?: TSignerExternalConfiguration;
};

export type TEnableSignerDTO = { signerId: string };
export type TDisableSignerDTO = { signerId: string };

export type TGetPublicKeyResponse = {
  publicKey: string;
  algorithm: string;
};

export type TListSigningOperationsDTO = {
  signerId: string;
  offset?: number;
  limit?: number;
  status?: SigningOperationStatus;
};

export type TListSigningOperationsResponse = {
  operations: TSigningOperation[];
  totalCount: number;
};

export type TListSignerMembersDTO = { signerId: string; kind: "user" | "identity" | "group" };
export type TListSignerMembersResponse = { memberships: TSignerMember[] };

export type TEffectiveSignerMember = {
  actorUserId: string | null;
  actorIdentityId: string | null;
  role: string;
  viaGroupIds: string[];
  isDirect: boolean;
  details: {
    name: string | null;
    email?: string | null;
    username?: string | null;
    authMethod?: string | null;
  } | null;
};
export type TListEffectiveSignerMembersDTO = { signerId: string; kind: "user" | "identity" };
export type TListEffectiveSignerMembersResponse = { members: TEffectiveSignerMember[] };
export type TAddSignerUserMembersDTO = {
  signerId: string;
  userIds?: string[];
  emails?: string[];
  role: SignerMemberRole;
};
export type TUpdateSignerUserRoleDTO = {
  signerId: string;
  userId: string;
  role: SignerMemberRole;
};
export type TRemoveSignerUserDTO = { signerId: string; userId: string };

export type TAddSignerIdentityMemberDTO = {
  signerId: string;
  identityId: string;
  role: SignerMemberRole;
};
export type TUpdateSignerIdentityRoleDTO = {
  signerId: string;
  identityId: string;
  role: SignerMemberRole;
};
export type TRemoveSignerIdentityDTO = { signerId: string; identityId: string };

export type TAddSignerGroupMemberDTO = {
  signerId: string;
  groupId: string;
  role: SignerMemberRole;
};

export type TUpdateSignerGroupRoleDTO = {
  signerId: string;
  groupId: string;
  role: SignerMemberRole;
};
export type TRemoveSignerGroupDTO = { signerId: string; groupId: string };

export type TUpdateSignerPolicyDTO = {
  signerId: string;
  steps: {
    stepNumber: number;
    name?: string | null;
    requiredApprovals: number;
    approverUserIds: string[];
    approverGroupIds?: string[];
  }[];
  constraints?: { maxSignings?: number | null; maxWindowDuration?: string | null };
};

export type TSignerRequestStatusFilter = "pending" | "approved" | "expired" | "revoked";

export type TListSignerRequestsDTO = {
  signerId: string;
  statuses?: TSignerRequestStatusFilter[];
  offset?: number;
  limit?: number;
};

export type TListSignerRequestsResponse = {
  requests: TSignerRequest[];
  totalCount: number;
};
export type TRequestToSignDTO = {
  signerId: string;
  justification: string;
  requestedSignings?: number;
  requestedWindowStart?: string;
  requestedWindowEnd?: string;
};
export type TPreApproveSigningDTO = {
  signerId: string;
  granteeUserId?: string;
  granteeIdentityId?: string;
  justification: string;
  requestedSignings?: number;
  requestedWindowStart?: string;
  requestedWindowEnd?: string;
};
export type TRevokeSignerRequestDTO = { signerId: string; requestId: string };
