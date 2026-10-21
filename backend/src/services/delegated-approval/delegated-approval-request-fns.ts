import { UnrecoverableError } from "bullmq";
import { Knex } from "knex";

import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";

import { DelegatedApprovalRequestStatus } from "./delegated-approval-enums";
import {
  TFailDelegatedApprovalRequestDeps,
  TFailDelegatedApprovalRequestDTO,
  TLoadDelegatedApprovalContextDeps
} from "./delegated-approval-types";
import { DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS } from "./dispatch/delegated-approval-dispatch-constants";

export const toDelegatedApprovalStatusReason = (reason: string) =>
  reason.slice(0, DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS);

// A delegated approval worker tells its failures apart by class: bullmq's UnrecoverableError means a
// retry cannot help, anything else is tried again by the outbox.
export const toDelegatedApprovalFailure = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return {
    terminal: error instanceof UnrecoverableError,
    message,
    logContext: { err: { name: (error as Error)?.name, message } }
  };
};

// A delegated request that can no longer be decided closes the approval request with it, so the
// requester is not left waiting and the policy is freed for editing. Only waiting_approval rows are
// moved: a row that was already decided keeps its outcome.
export const failDelegatedApprovalRequest = (
  { id, requestId, reason, closeAs = ApprovalRequestStatus.Cancelled }: TFailDelegatedApprovalRequestDTO,
  { approvalRequestDAL, delegatedApprovalRequestDAL }: TFailDelegatedApprovalRequestDeps,
  tx?: Knex
) => {
  const run = async (trx: Knex) => {
    const approvalRequest = await approvalRequestDAL.findByIdForUpdate(requestId, trx);
    const [failed] = await delegatedApprovalRequestDAL.update(
      { id, status: DelegatedApprovalRequestStatus.WaitingApproval },
      { status: DelegatedApprovalRequestStatus.Failed, statusReason: toDelegatedApprovalStatusReason(reason) },
      trx
    );
    if (failed && approvalRequest?.status === ApprovalRequestStatus.Pending) {
      await approvalRequestDAL.updateById(requestId, { status: closeAs }, trx);
    }
    return Boolean(failed);
  };

  return tx ? run(tx) : approvalRequestDAL.transaction(run);
};

// The rows a worker needs to act on a delegated request, read from the primary because they were
// committed together with the event that woke the worker.
export const loadDelegatedApprovalContext = async (
  delegatedRequestId: string,
  { delegatedApprovalRequestDAL, approvalRequestDAL, delegatedApprovalPolicyDAL }: TLoadDelegatedApprovalContextDeps
) => {
  const primary = delegatedApprovalRequestDAL.primaryNode();

  const delegatedRequest = await delegatedApprovalRequestDAL.findById(delegatedRequestId, primary);
  if (!delegatedRequest) return null;

  const approvalRequest = await approvalRequestDAL.findById(delegatedRequest.requestId, primary);
  const delegatedPolicy = approvalRequest?.policyId
    ? await delegatedApprovalPolicyDAL.findOne({ policyId: approvalRequest.policyId }, primary)
    : null;

  return { delegatedRequest, approvalRequest, delegatedPolicy };
};
