import { Knex } from "knex";

import { BadRequestError, ConflictError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { ApprovalStatus } from "../access-approval-request/access-approval-request-types";
import { ExternalApprovalRequestStatus } from "./external-approval-enums";
import { EXTERNAL_APPROVAL_APP_CONNECTION_MAP, listExternalApprovalOptions } from "./external-approval-map";
import { TExternalApprovalPolicyDALFactory } from "./external-approval-policy-dal";
import { TExternalApprovalRequestDALFactory } from "./external-approval-request-dal";
import {
  TAuthorizeExternalReviewDTO,
  TExternalApprovalDecision,
  TResolveExternalApprovalDecisionDTO,
  TValidateExternalApprovalPolicyInputDTO
} from "./external-approval-types";

type TExternalApprovalServiceFactoryDep = {
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  identityDAL: Pick<TIdentityDALFactory, "findOne">;
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "findById">;
  externalApprovalRequestDAL: Pick<TExternalApprovalRequestDALFactory, "findById" | "updateById">;
};

export type TExternalApprovalServiceFactory = ReturnType<typeof externalApprovalServiceFactory>;

const DECISION_TO_EXTERNAL_STATUS: Record<TExternalApprovalDecision, ExternalApprovalRequestStatus> = {
  [ApprovalStatus.APPROVED]: ExternalApprovalRequestStatus.Approved,
  [ApprovalStatus.REJECTED]: ExternalApprovalRequestStatus.Rejected
};

const FINAL_EXTERNAL_STATUSES: string[] = [
  ExternalApprovalRequestStatus.Approved,
  ExternalApprovalRequestStatus.Rejected
];

export const externalApprovalServiceFactory = ({
  appConnectionService,
  identityDAL,
  externalApprovalPolicyDAL,
  externalApprovalRequestDAL
}: TExternalApprovalServiceFactoryDep) => {
  const validateExternalApprovalPolicyInput = async ({
    input,
    projectId,
    actor
  }: TValidateExternalApprovalPolicyInputDTO) => {
    const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[input.type];
    await appConnectionService.validateAppConnectionUsageById(
      app,
      { connectionId: input.connectionId, projectId },
      actor
    );

    if (!input.approverIdentityId) {
      throw new NotFoundError({
        message: `Approver identity ID is required for external approval policy`
      });
    }

    const identity = await identityDAL.findOne({ id: input.approverIdentityId, orgId: actor.orgId });
    if (!identity) {
      throw new NotFoundError({
        message: `Identity with ID '${input.approverIdentityId}' not found in your organization`
      });
    }
  };

  const authorizeExternalReview = async ({ externalApprovalPolicyId, actor }: TAuthorizeExternalReviewDTO) => {
    const externalApprovalPolicy = await externalApprovalPolicyDAL.findById(externalApprovalPolicyId);
    if (!externalApprovalPolicy) {
      throw new NotFoundError({
        message: `External approval policy with ID '${externalApprovalPolicyId}' not found`
      });
    }

    if (
      actor.type !== ActorType.IDENTITY ||
      !externalApprovalPolicy.approverIdentityId ||
      externalApprovalPolicy.approverIdentityId !== actor.id
    ) {
      throw new ForbiddenRequestError({
        message: "Only the approver identity configured on this external approval policy can report its decision"
      });
    }

    return externalApprovalPolicy;
  };

  const resolveExternalApprovalDecision = async (
    { externalApprovalRequestId, externalId, status, approvedByIdentityId }: TResolveExternalApprovalDecisionDTO,
    tx: Knex
  ) => {
    const externalApprovalRequest = await externalApprovalRequestDAL.findById(externalApprovalRequestId, tx);
    if (!externalApprovalRequest) {
      throw new NotFoundError({
        message: `External approval request with ID '${externalApprovalRequestId}' not found`
      });
    }

    const targetStatus = DECISION_TO_EXTERNAL_STATUS[status];

    if (externalApprovalRequest.status && FINAL_EXTERNAL_STATUSES.includes(externalApprovalRequest.status)) {
      if (externalApprovalRequest.status === targetStatus) {
        return { externalApprovalRequest, alreadyFinalized: true as const };
      }
      throw new ConflictError({
        message: "A different decision has already been recorded for this request"
      });
    }

    if (externalApprovalRequest.status === ExternalApprovalRequestStatus.FailedDispatch) {
      throw new BadRequestError({
        message: "The request was never delivered to the external approver, so no decision can be recorded for it"
      });
    }

    if (
      externalApprovalRequest.status !== ExternalApprovalRequestStatus.WaitingApproval ||
      !externalApprovalRequest.externalId
    ) {
      throw new BadRequestError({
        message: "The request has not finished dispatching to the external approver yet. Retry shortly."
      });
    }

    if (externalApprovalRequest.externalId !== externalId) {
      throw new BadRequestError({
        message: "The external ID does not match the external approval request for this access request"
      });
    }

    const updated = await externalApprovalRequestDAL.updateById(
      externalApprovalRequestId,
      {
        status: targetStatus,
        approvedAt: new Date(),
        approvedByIdentityId
      },
      tx
    );

    return { externalApprovalRequest: updated, alreadyFinalized: false as const };
  };

  return {
    listExternalApprovalOptions,
    validateExternalApprovalPolicyInput,
    authorizeExternalReview,
    resolveExternalApprovalDecision
  };
};
