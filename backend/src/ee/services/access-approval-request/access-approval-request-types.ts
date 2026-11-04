import { TProjectPermission } from "@app/lib/types";
import {
  DelegatedApprovalPolicyType,
  DelegatedApprovalRequestStatus
} from "@app/services/delegated-approval/delegated-approval-enums";
import { TDelegatedApprovalProviderDetails } from "@app/services/delegated-approval/delegated-approval-types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  REVOKED = "revoked"
}

export type TVerifyPermission = {
  permissions: unknown;
};

export type TGetAccessRequestCountDTO = {
  projectSlug: string;
  policyId?: string;
} & Omit<TProjectPermission, "projectId">;

export type TReviewAccessRequestDTO = {
  requestId: string;
  status: ApprovalStatus;
  envName?: string;
  bypassReason?: string;
} & Omit<TProjectPermission, "projectId">;

export type TCreateAccessApprovalRequestDTO = {
  projectSlug: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
  note?: string;
} & Omit<TProjectPermission, "projectId">;

export type TRevokeAccessRequestDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TRetryDelegatedApprovalDispatchDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TCancelAccessRequestDTO = {
  requestId: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAccessApprovalRequestDTO = {
  requestId: string;
  temporaryRange: string;
  editNote: string;
} & Omit<TProjectPermission, "projectId">;

export type TListApprovalRequestsDTO = {
  projectSlug: string;
  authorUserId?: string;
  envSlug?: string;
} & Omit<TProjectPermission, "projectId">;

export interface TAccessApprovalRequestServiceFactory {
  createAccessApprovalRequest: (arg: TCreateAccessApprovalRequestDTO) => Promise<{
    request: {
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      expiresAt?: Date | null | undefined;
    };
    projectId: string;
  }>;
  updateAccessApprovalRequest: (arg: TUpdateAccessApprovalRequestDTO) => Promise<{
    request: {
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      expiresAt?: Date | null | undefined;
    };
    projectId: string;
  }>;
  listApprovalRequests: (arg: TListApprovalRequestsDTO) => Promise<{
    requests: {
      policy: {
        approvers: (
          | {
              userId: string | null | undefined;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
              email: string | null | undefined;
              username: string;
              isOrgMembershipActive: boolean;
            }
          | {
              userId: string;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
              email: string | null | undefined;
              username: string;
              isOrgMembershipActive: boolean;
            }
        )[];
        bypassers: string[];
        id: string | null;
        name: string;
        approvals: number;
        secretPath: string | null | undefined;
        enforcementLevel: string;
        allowedSelfApprovals: boolean;
        envId: string;
        deletedAt: Date | null | undefined;
        maxTimePeriod?: string | null;
        requestExpirationTime?: string | null;
        delegatedApproval?: { type: DelegatedApprovalPolicyType } | null;
      };
      delegatedApproval?: {
        status: DelegatedApprovalRequestStatus;
        statusReason: string | null;
        provider: TDelegatedApprovalProviderDetails | null;
      } | null;
      projectId: string;
      environment: string;
      environmentName: string;
      requestedByUser: {
        userId: string;
        email: string | null | undefined;
        firstName: string | null | undefined;
        lastName: string | null | undefined;
        username: string;
      };
      approvedByUser: {
        userId: string;
        email: string | null | undefined;
        firstName: string | null | undefined;
        lastName: string | null | undefined;
        username: string;
      } | null;
      revokedByUser: {
        userId: string;
        email: string | null | undefined;
        firstName: string | null | undefined;
        lastName: string | null | undefined;
        username: string;
      } | null;
      privilege: {
        membershipId: string;
        userId: string;
        projectId: string;
        isTemporary: boolean;
        temporaryMode: string | null | undefined;
        temporaryRange: string | null | undefined;
        temporaryAccessStartTime: Date | null | undefined;
        temporaryAccessEndTime: Date | null | undefined;
        permissions: unknown;
      } | null;
      isApproved: boolean;
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string | null;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      expiresAt?: Date | null | undefined;
      reviewers: {
        userId: string;
        status: string;
        isOrgMembershipActive: boolean;
      }[];
      approvers: (
        | {
            userId: string | null | undefined;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
            isOrgMembershipActive: boolean;
          }
        | {
            userId: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
            isOrgMembershipActive: boolean;
          }
      )[];
      bypassers: string[];
    }[];
  }>;
  reviewAccessRequest: (arg: TReviewAccessRequestDTO) => Promise<{
    id: string;
    requestId: string;
    reviewerUserId: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    policyId: string;
    isBypass: boolean;
  }>;
  getCount: (arg: TGetAccessRequestCountDTO) => Promise<{
    count: {
      pendingCount: number;
      finalizedCount: number;
    };
  }>;
  retryDelegatedApprovalDispatch: (arg: TRetryDelegatedApprovalDispatchDTO) => Promise<{
    request: {
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      expiresAt?: Date | null | undefined;
    };
    projectId: string;
    delegatedApprovalType: DelegatedApprovalPolicyType;
    policyName: string;
    requesterName: string;
    requesterEmail: string;
    environment: string;
    secretPath: string;
  }>;
  cancelAccessRequest: (arg: TCancelAccessRequestDTO) => Promise<{
    request: {
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      expiresAt?: Date | null | undefined;
    };
    projectId: string;
    policyName: string;
    requesterName: string;
    requesterEmail: string;
    environment: string;
    secretPath: string;
  }>;
  revokeAccessRequest: (arg: TRevokeAccessRequestDTO) => Promise<{
    request: {
      status: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      expiresAt?: Date | null | undefined;
      revokedAt?: Date | null | undefined;
      revokedByUserId?: string | null | undefined;
    };
    projectId: string;
  }>;
}
