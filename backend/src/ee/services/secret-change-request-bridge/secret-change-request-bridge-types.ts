import { Knex } from "knex";

import {
  TCreateSecretApprovalRequestV2BridgeDTO,
  TGenerateSecretApprovalRequestV2BridgeDTO,
  TMergeSecretApprovalRequestDTO,
  TReviewRequestDTO,
  TSecretApprovalDetailsDTO,
  TStatusChangeDTO
} from "../secret-approval-request/secret-approval-request-types";

export type TSecretChangeRequestBridgeMethods = {
  generateSecretChangeRequest: (
    dto: TGenerateSecretApprovalRequestV2BridgeDTO & { trx?: Knex; skipPostProcessing?: boolean }
  ) => Promise<never>;
  createSecretChangeRequest: (dto: TCreateSecretApprovalRequestV2BridgeDTO, tx?: Knex) => Promise<never>;
  mergeSecretChangeRequest: (dto: TMergeSecretApprovalRequestDTO) => Promise<never>;
  reviewSecretChangeRequest: (dto: TReviewRequestDTO) => Promise<never>;
  updateSecretChangeRequestStatus: (dto: TStatusChangeDTO) => Promise<never>;
  getSecretChangeRequestById: (dto: TSecretApprovalDetailsDTO) => Promise<never>;
};
