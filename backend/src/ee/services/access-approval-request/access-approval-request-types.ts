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
} & Omit<TProjectPermission, "projectId">;

export type TCreateAccessApprovalRequestDTO = {
  projectSlug: string;
  permissions: unknown;
  isTemporary: boolean;
  temporaryRange?: string;
} & Omit<TProjectPermission, "projectId">;

export type TListApprovalRequestsDTO = {
  projectSlug: string;
  authorUserId?: string;
  envSlug?: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteApprovalRequestDTO = {
  requestId: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;
