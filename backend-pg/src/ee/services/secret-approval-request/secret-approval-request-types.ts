import { TImmutableDBKeys, TSaRequestSecrets, TSecretApprovalPolicies } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export enum CommitType {
  Create = "create",
  Update = "update",
  Delete = "delete"
}

export enum RequestState {
  Open = "open",
  Closed = "closed"
}

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

type TApprovalCreateSecret = Omit<TSaRequestSecrets, TImmutableDBKeys | "version"> & {
  secretName: string;
  tagIds?: string[];
};
type TApprovalUpdateSecret = Partial<Omit<TSaRequestSecrets, TImmutableDBKeys | "version">> & {
  secretName: string;
  newSecretName?: string;
  tagIds?: string[];
};

export type TGenerateSecretApprovalRequestDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
  policy: TSecretApprovalPolicies;
  commiterMembershipId: string;
  data: {
    [CommitType.Create]: TApprovalCreateSecret[];
    [CommitType.Update]: TApprovalUpdateSecret[];
    [CommitType.Delete]: { secretName: string }[];
  };
};

export type TMergeSecretApprovalRequestDTO = {
  approvalId: string;
} & Omit<TProjectPermission, "projectId">;

export type TStatusChangeDTO = {
  approvalId: string;
  status: "open" | "close";
} & Omit<TProjectPermission, "projectId">;

export type TReviewRequestDTO = {
  approvalId: string;
  status: ApprovalStatus;
} & Omit<TProjectPermission, "projectId">;

export type TApprovalRequestCountDTO = TProjectPermission;

export type TListApprovalsDTO = {
  projectId: string;
  status?: RequestState;
  environment?: string;
  committer?: string;
  limit?: number;
  offset?: number;
} & TProjectPermission;

export type TSecretApprovalDetailsDTO = {
  id:string;
} & Omit<TProjectPermission, 'projectId'>
