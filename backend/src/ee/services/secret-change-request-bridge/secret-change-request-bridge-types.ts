import { Knex } from "knex";

import {
  TSecretApprovalRequests,
  TSecretApprovalRequestsReviewers,
  TSecretApprovalRequestsSecretsV2
} from "@app/db/schemas";

import {
  TCreateSecretApprovalRequestV2BridgeDTO,
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

export type TSecretChangeRequestReview = TSecretApprovalRequestsReviewers & { projectId: string };

export type TSecretChangeRequestBridgeMethods = {
  generateSecretChangeRequest: (
    dto: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex; skipPostProcessing?: boolean }
  ) => Promise<TSecretChangeRequest>;
  createSecretChangeRequest: (dto: TCreateSecretApprovalRequestV2BridgeDTO, tx?: Knex) => Promise<never>;
  mergeSecretChangeRequest: (dto: TMergeSecretApprovalRequestDTO) => Promise<never>;
  reviewSecretChangeRequest: (dto: TReviewRequestDTO) => Promise<TSecretChangeRequestReview>;
  updateSecretChangeRequestStatus: (dto: TStatusChangeDTO) => Promise<never>;
  getSecretChangeRequestById: (dto: TSecretApprovalDetailsDTO) => Promise<never>;
};
