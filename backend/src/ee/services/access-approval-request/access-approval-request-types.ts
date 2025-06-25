import { TProjectPermission } from "@app/lib/types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export type TVerifyPermission = {
  permissions: unknown;
};

export type TGetAccessRequestCountDTO = {
  projectSlug: string;
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
    };
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
            }
          | {
              userId: string;
              sequence: number | null | undefined;
              approvalsRequired: number | null | undefined;
              email: string | null | undefined;
              username: string;
            }
        )[];
        bypassers: string[];
        id: string;
        name: string;
        approvals: number;
        secretPath: string | null | undefined;
        enforcementLevel: string;
        allowedSelfApprovals: boolean;
        envId: string;
        deletedAt: Date | null | undefined;
      };
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
      policyId: string;
      isTemporary: boolean;
      requestedByUserId: string;
      privilegeId?: string | null | undefined;
      requestedBy?: string | null | undefined;
      temporaryRange?: string | null | undefined;
      permissions?: unknown;
      note?: string | null | undefined;
      privilegeDeletedAt?: Date | null | undefined;
      reviewers: {
        userId: string;
        status: string;
      }[];
      approvers: (
        | {
            userId: string | null | undefined;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
          }
        | {
            userId: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
            email: string | null | undefined;
            username: string;
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
  }>;
  getCount: (arg: TGetAccessRequestCountDTO) => Promise<{
    count: {
      pendingCount: number;
      finalizedCount: number;
    };
  }>;
}
