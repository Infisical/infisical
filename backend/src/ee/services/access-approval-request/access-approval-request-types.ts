import { TProjectPermission } from "@app/lib/types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export type TGetAccessRequestCountDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TReviewAccessRequestDTO = {
  requestId: string;
  status: ApprovalStatus;
} & Omit<TProjectPermission, "projectId">;

export type TCreateAccessApprovalRequestDTO = {
  projectSlug: string;
  secretPath: string;
  envSlug: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
} & Omit<TProjectPermission, "projectId">;

export type TListApprovalRequestsDTO = {
  projectSlug: string;
  authorProjectMembershipId?: string;
  envSlug?: string;
} & Omit<TProjectPermission, "projectId">;
