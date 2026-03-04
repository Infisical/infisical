import { TSecretApprovalPolicy } from "../secretApproval/types";
import { SecretV3Raw } from "../secrets/types";
import { WsTag } from "../tags/types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export enum CommitType {
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create",
  ADD = "add"
}

export type TSecretApprovalSecChangeData = {
  id: string;
  secretKey: string;
  secretValue?: string;
  secretComment?: string;
  skipMultilineEncoding?: boolean | null;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
  tags?: WsTag[];
  version: number;
};

export type TSecretApprovalSecChange = {
  id: string;
  version: number;
  secretKey: string;
  secretValue?: string;
  secretValueHidden?: boolean;
  secretComment?: string;
  isRotatedSecret?: boolean;
  tags?: string[];
};

export type TSecretApprovalRequest = {
  id: string;
  isReplicated?: boolean;
  slug: string;
  createdAt: string;
  updatedAt: string;
  committerUserId: string;
  reviewers: {
    userId: string;
    status: ApprovalStatus;
    comment: string;
    email: string;
    firstName: string;
    lastName: string;
    username: string;
    isOrgMembershipActive: boolean;
    createdAt: Date;
  }[];
  project: string;
  environment: string;
  folderId: string;
  secretPath: string;
  hasMerged: boolean;
  status: "open" | "close";
  policy: Omit<TSecretApprovalPolicy, "approvers" | "bypassers"> & {
    approvers: {
      isOrgMembershipActive: boolean;
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      username: string;
    }[];
    bypassers: {
      userId: string;
      email: string;
      firstName: string;
      lastName: string;
      username: string;
    }[];
  };
  statusChangedByUserId: string;
  statusChangedByUser?: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  committerUser: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    username: string;
  };
  conflicts: Array<{ secretId: string; op: CommitType.UPDATE }>;
  commits: ({
    // if there is no secret means it was creation
    secretMetadata?: { key: string; value: string }[];
    secret?: { version: number };
    secretVersion: SecretV3Raw;
    // if there is no new version its for Delete
    op: CommitType;
  } & TSecretApprovalSecChangeData)[];
};

export type TSecretApprovalRequestCount = {
  open: number;
  closed: number;
};

export type TGetSecretApprovalRequestList = {
  projectId: string;
  environment?: string;
  status?: "open" | "close";
  committer?: string;
  limit?: number;
  offset?: number;
  search?: string;
};

export type TGetSecretApprovalRequestCount = {
  projectId: string;
  policyId?: string;
};

export type TGetSecretApprovalRequestDetails = {
  id: string;
};

export type TUpdateSecretApprovalReviewStatusDTO = {
  status: ApprovalStatus;
  comment?: string;
  id: string;
};

export type TUpdateSecretApprovalRequestStatusDTO = {
  status: "open" | "close";
  id: string;
  projectId: string;
};

export type TPerformSecretApprovalRequestMerge = {
  id: string;
  projectId: string;
  bypassReason?: string;
};
