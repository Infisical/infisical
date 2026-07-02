import { TActorContext } from "../pam/pam-permission";

export type TGetApprovalConfigurationDTO = {
  folderId: string;
  projectId: string;
} & TActorContext;

export type TSetApprovalConfigurationDTO = {
  folderId: string;
  projectId: string;
  steps: {
    approvers: { type: "user" | "group"; id: string }[];
  }[];
} & TActorContext;

export type TCreateAccessRequestDTO = {
  accountId: string;
  projectId: string;
  note?: string;
  duration: string;
} & TActorContext;

export type TListAccessRequestsDTO = {
  projectId: string;
  folderId?: string;
  status?: string;
  offset?: number;
  limit?: number;
} & TActorContext;

export type TListPendingMyApprovalDTO = {
  projectId: string;
  folderId?: string;
} & TActorContext;

export type TGetAccessRequestCountDTO = {
  projectId: string;
} & TActorContext;

export type TReviewAccessRequestDTO = {
  requestId: string;
  projectId: string;
  status: "approved" | "rejected";
  comment?: string;
} & TActorContext;

export type TRevokeAccessRequestDTO = {
  requestId: string;
  projectId: string;
} & TActorContext;

export type TCheckGrantDTO = {
  userId: string;
  accountId: string;
  projectId: string;
};

export type TPamAccessRequestData = {
  accountId: string;
  folderId: string;
  note?: string;
  duration: string;
};
