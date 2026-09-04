import { ApprovalRequestApprovalDecision, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import { ActorType } from "@app/services/auth/auth-type";

import { PamAccessType, PamNotificationEvent } from "../pam/pam-enums";
import { TActorContext } from "../pam/pam-permission";

export type TGetApprovalConfigurationDTO = {
  folderId: string;
  projectId: string;
} & TActorContext;

export type TPamNotificationConfigInput = {
  workflowIntegrationId: string;
  channels: { id: string; name: string }[];
  events: PamNotificationEvent[];
};

export type TSetApprovalConfigurationDTO = {
  folderId: string;
  projectId: string;
  steps: {
    approvers: { type: ApproverType; id: string }[];
  }[];
  // undefined leaves existing configs unchanged so older clients that only manage steps can't wipe them
  notificationConfigs?: TPamNotificationConfigInput[];
} & TActorContext;

export type TCreateAccessRequestDTO = {
  accountId?: string;
  path?: string;
  projectId: string;
  reason?: string;
  duration: string;
  accessType?: PamAccessType;
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
  status: ApprovalRequestApprovalDecision;
  comment?: string;
} & TActorContext;

export type TRevokeAccessRequestDTO = {
  requestId: string;
  projectId: string;
} & TActorContext;

// Requests and grants key their actor by user OR machine identity, never both
export type TAccessRequestActor = {
  actorId: string;
  actor: ActorType;
};

export type TCheckGrantDTO = {
  accountId: string;
  accountFolderId?: string | null;
  projectId: string;
  accessType?: PamAccessType;
} & TAccessRequestActor;

export type TPamAccessRequestData = {
  accountId: string;
  folderId: string;
  reason?: string;
  duration: string;
  accessType?: PamAccessType;
};

export type TGetAccountApproversDTO = {
  accountId: string;
  projectId: string;
  accessType?: PamAccessType;
} & TActorContext;
