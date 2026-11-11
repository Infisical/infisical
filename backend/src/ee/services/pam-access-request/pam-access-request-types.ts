import { ActorType } from "@app/lib/auth/actor-types";
import { TActorInput } from "@app/lib/types";
import { ApprovalRequestApprovalDecision, ApproverType } from "@app/services/approval-policy/approval-policy-enums";
import {
  TAutoApprovalConfig,
  TAutoApprovalInputValue
} from "@app/services/approval-policy/auto-approval/auto-approval-types";

import { PamAccessType, PamNotificationEvent } from "../pam/pam-enums";

export type TGetApprovalConfigurationDTO = {
  folderId: string;
  projectId: string;
} & TActorInput;

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
  breakGlassUsers?: { type: ApproverType; id: string }[];
  // undefined leaves the stored rules unchanged
  autoApproval?: TAutoApprovalConfig;
} & TActorInput;

export type TBreakGlassAccessRequestDTO = {
  requestId: string;
  projectId: string;
  bypassReason: string;
} & TActorInput;

export type TCreateAccessRequestDTO = {
  breakGlass?: boolean;
  accountId?: string;
  path?: string;
  projectId: string;
  reason?: string;
  duration: string;
  accessType?: PamAccessType;
  autoApprovalInputs?: TAutoApprovalInputValue[];
} & TActorInput;

export type TListAccessRequestsDTO = {
  projectId: string;
  folderId?: string;
  status?: string;
  offset?: number;
  limit?: number;
} & TActorInput;

export type TListPendingMyApprovalDTO = {
  projectId: string;
  folderId?: string;
} & TActorInput;

export type TGetAccessRequestCountDTO = {
  projectId: string;
} & TActorInput;

export type TReviewAccessRequestDTO = {
  requestId: string;
  projectId: string;
  status: ApprovalRequestApprovalDecision;
  comment?: string;
} & TActorInput;

export type TRevokeAccessRequestDTO = {
  requestId: string;
  projectId: string;
} & TActorInput;

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
} & TActorInput;
