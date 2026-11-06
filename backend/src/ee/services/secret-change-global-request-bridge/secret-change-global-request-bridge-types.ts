import { Knex } from "knex";

import {
  TSecretApprovalRequests,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsSecretsV2,
  TSecretApprovalRequestsSecretsV2Insert
} from "@app/db/schemas";
import { Actor, Event } from "@app/ee/services/audit-log/audit-log-types";

import { TSecretApprovalRequestListFilter } from "../secret-approval-request/secret-approval-request-dal";
import { TFormattedSecretApprovalCommitV2Bridge } from "../secret-approval-request/secret-approval-request-details-fns";
import { TMergedSecretsV2Bridge } from "../secret-approval-request/secret-approval-request-merge-fns";
import {
  TCreateSecretApprovalRequestV2BridgeDTO,
  TCreateSecretApprovalSideEffectsDTO,
  TGenerateSecretApprovalRequestV2BridgeDTO,
  TMergeSecretApprovalRequestDTO,
  TReviewRequestDTO,
  TSecretApprovalDetailsDTO,
  TStatusChangeDTO
} from "../secret-approval-request/secret-approval-request-types";

// Everything a secret change request carries lives on secret_change_requests and its commits, so the
// generic request envelope holds no data of its own.
export type TSecretChangeRequestData = Record<string, never>;

export type TSecretChangeRequest = TSecretApprovalRequests & { commits: TSecretApprovalRequestsSecretsV2[] };

export type TSecretChangeRequestBase = Omit<TSecretChangeRequest, "commits" | "policyId"> & { policyId: string | null };

export type TSecretChangeRequestCommitInsert = Omit<
  TSecretApprovalRequestsSecretsV2Insert,
  "requestId" | "secretChangeId"
>;

export type TSecretChangeRequestReview = TSecretApprovalRequestsReviewers & { projectId: string };

export type TSecretChangeRequestMergeResult = {
  secrets: TMergedSecretsV2Bridge;
  approval: TSecretChangeRequest;
  projectId: string;
  secretMutationEvents: Event[];
  isMergedViaBypass: boolean;
  requestedByActor?: Actor;
};

export type TSecretChangeRequestStatusResult = Omit<TSecretChangeRequest, "commits"> & { projectId: string };

export type TApprovalRequestUser = {
  userId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username: string;
};

export type TSecretChangeRequestPolicySummary = {
  id: string;
  name: string;
  approvals: number;
  secretPath: string | null;
  enforcementLevel: string;
  allowedSelfApprovals: boolean;
  deletedAt: Date | null;
};

export type TSecretChangeRequestCommitter = {
  committerUser: TApprovalRequestUser | null;
  committerIdentity: { identityId: string; name: string } | null;
};

export type TSecretChangeRequestDetails = TSecretChangeRequestBase &
  TSecretChangeRequestCommitter & {
    projectId: string;
    environment: string;
    secretPath: string;
    policy: TSecretChangeRequestPolicySummary & {
      approvers: (TApprovalRequestUser & { isOrgMembershipActive: boolean | null })[];
      bypassers: TApprovalRequestUser[];
    };
    statusChangedByUser?: TApprovalRequestUser;
    reviewers: (TApprovalRequestUser & {
      status: string;
      comment: string;
      createdAt: Date;
      isOrgMembershipActive: boolean | null;
    })[];
    commits: TFormattedSecretApprovalCommitV2Bridge[];
  };

export type TSecretChangeRequestListItem = TSecretChangeRequestBase &
  TSecretChangeRequestCommitter & {
    projectId: string;
    environment: string;
    environmentName: string | null;
    policy: TSecretChangeRequestPolicySummary & { approvers: { userId: string }[]; bypassers: { userId: string }[] };
    reviewers: { userId: string; status: string }[];
    commits: { op: string; secretId: string | null }[];
    approvers: { userId: string }[];
    bypassers: { userId: string }[];
  };

export type TSecretChangeRequestListResult = { approvals: TSecretChangeRequestListItem[]; totalCount: number };

export type TSecretChangeRequestCount = { open: number; closed: number };

export type TCountSecretChangeGlobalRequestsDTO = { projectId: string; userId?: string; policyId?: string };

export type TSecretChangeGlobalRequestBridgeMethods = {
  generateSecretChangeRequest: (
    dto: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex; skipPostProcessing?: boolean }
  ) => Promise<TSecretChangeRequest>;
  createSecretChangeRequest: (dto: TCreateSecretApprovalRequestV2BridgeDTO, tx?: Knex) => Promise<TSecretChangeRequest>;
  createSecretChangeRequestSideEffects: (dto: TCreateSecretApprovalSideEffectsDTO) => Promise<void>;
  mergeSecretChangeRequest: (dto: TMergeSecretApprovalRequestDTO) => Promise<TSecretChangeRequestMergeResult>;
  reviewSecretChangeRequest: (dto: TReviewRequestDTO) => Promise<TSecretChangeRequestReview>;
  updateSecretChangeRequestStatus: (dto: TStatusChangeDTO) => Promise<TSecretChangeRequestStatusResult>;
  getSecretChangeRequestById: (dto: TSecretApprovalDetailsDTO) => Promise<TSecretChangeRequestDetails>;
  listSecretChangeRequests: (filter: TSecretApprovalRequestListFilter) => Promise<TSecretChangeRequestListResult>;
  countSecretChangeRequests: (dto: TCountSecretChangeGlobalRequestsDTO) => Promise<TSecretChangeRequestCount>;
};
