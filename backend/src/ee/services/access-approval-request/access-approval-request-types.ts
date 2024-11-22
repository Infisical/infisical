import { TProjectPermission } from "@app/lib/types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export type TVerifyPermission = {
  permissions: unknown;
  checkPath?: boolean;
};

export type TGetAccessRequestCountDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TReviewAccessRequestDTO = {
  requestId: string;
  status: ApprovalStatus;
} & Omit<TProjectPermission, "projectId">;

export type TCreateAccessApprovalRequestDTO = {
  projectSlug: string;
  environment: string;
  // permissions: unknown;
  requestedActions: {
    read: boolean;
    edit: boolean;
    create: boolean;
    delete: boolean;
  };
  secretPaths: string[];
  isTemporary: boolean;
  temporaryRange?: string;
} & Omit<TProjectPermission, "projectId">;

export type TListApprovalRequestsDTO = {
  projectSlug: string;
  authorProjectMembershipId?: string;
  envSlug?: string;
} & Omit<TProjectPermission, "projectId">;
