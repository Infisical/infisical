import { UserWsKeyPair } from "../keys/types";
import { TSecretApprovalPolicy } from "../secretApproval/types";
import { EncryptedSecret } from "../secrets/types";
import { WsTag } from "../tags/types";

export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected"
}

export enum CommitType {
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create"
}

export type TSecretApprovalSecChangeData = {
  id: string;
  secretKeyCiphertext: string;
  secretKeyIV: string;
  secretKeyTag: string;
  secretValueCiphertext: string;
  secretValueIV: string;
  secretValueTag: string;
  secretCommentIV: string;
  secretCommentTag: string;
  secretCommentCiphertext: string;
  skipMultilineEncoding?: boolean;
  algorithm: "aes-256-gcm";
  keyEncoding: "utf8" | "base64";
  tags?: WsTag[];
  version: number;
};

export type TSecretApprovalSecChange = {
  id: string;
  version: number;
  secretKey: string;
  secretValue: string;
  secretComment: string;
  tags?: string[];
};

export type TSecretApprovalRequest<J extends unknown = EncryptedSecret> = {
  id: string;
  slug: string;
  createdAt: string;
  committerUserId: string;
  reviewers: {
    member: string;
    status: ApprovalStatus;
  }[];
  workspace: string;
  environment: string;
  folderId: string;
  secretPath: string;
  hasMerged: boolean;
  status: "open" | "close";
  policy: TSecretApprovalPolicy;
  statusChangeByUserId: string;
  conflicts: Array<{ secretId: string; op: CommitType.UPDATE }>;
  commits: ({
    // if there is no secret means it was creation
    secret?: { version: number };
    secretVersion: J;
    // if there is no new version its for Delete
    op: CommitType;
  } & TSecretApprovalSecChangeData)[];
};

export type TSecretApprovalRequestCount = {
  open: number;
  closed: number;
};

export type TGetSecretApprovalRequestList = {
  workspaceId: string;
  environment?: string;
  status?: "open" | "close";
  committer?: string;
  limit?: number;
  offset?: number;
};

export type TGetSecretApprovalRequestCount = {
  workspaceId: string;
};

export type TGetSecretApprovalRequestDetails = {
  id: string;
  decryptKey: UserWsKeyPair;
};

export type TUpdateSecretApprovalReviewStatusDTO = {
  status: ApprovalStatus;
  id: string;
};

export type TUpdateSecretApprovalRequestStatusDTO = {
  status: "open" | "close";
  id: string;
  workspaceId: string;
};

export type TPerformSecretApprovalRequestMerge = {
  id: string;
  workspaceId: string;
};
