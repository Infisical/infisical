import { UnrecoverableError } from "bullmq";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { logger } from "@app/lib/logger";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { isApprovalRequestExpired } from "@app/services/approval-policy/approval-policy-service";
import { TApprovalRequest, TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import { ActorType } from "@app/services/auth/auth-type";
import {
  DelegatedApprovalPolicyType,
  DelegatedApprovalRequestStatus
} from "@app/services/delegated-approval/delegated-approval-enums";
import { requireDelegatedApprovalConnection } from "@app/services/delegated-approval/delegated-approval-guards";
import {
  DELEGATED_APPROVAL_FINAL_STATE,
  DELEGATED_APPROVAL_NAME_MAP,
  isDelegatedApprovalSupportedPolicyType
} from "@app/services/delegated-approval/delegated-approval-maps";
import {
  failDelegatedApprovalRequest,
  loadDelegatedApprovalContext,
  toDelegatedApprovalFailure,
  toDelegatedApprovalStatusReason
} from "@app/services/delegated-approval/delegated-approval-request-fns";
import {
  getDelegatedApprovalDispatchDetailsBuilder,
  getDelegatedApprovalProvider
} from "@app/services/delegated-approval/dispatch/delegated-approval-dispatch-fns";
import { EventResultStatus } from "@app/services/event-outbox/event-outbox-types";

import {
  DELEGATED_APPROVAL_DECISION_RETRY_HINT,
  DELEGATED_APPROVAL_DECISION_STOPPED_HINT
} from "./delegated-approval-decision-constants";
import { DelegatedApprovalDecision, DelegatedApprovalDecisionOutcome } from "./delegated-approval-decision-enums";
import {
  describeDelegatedApprovalPermissions,
  haveSameDelegatedApprovalPermissions,
  normalizeDelegatedApprovalPermissions
} from "./delegated-approval-decision-fns";
import {
  TApplyDelegatedApprovalDecisionDTO,
  TApplyDelegatedApprovalDecisionResult,
  TDecidedDelegatedApprovalReadResult,
  TDelegatedApprovalDecisionAuditMetadata,
  TDelegatedApprovalDecisionContext,
  TDelegatedApprovalDecisionServiceFactoryDep,
  TDelegatedApprovalFinalizeOutcome
} from "./delegated-approval-decision-types";

export type TDelegatedApprovalDecisionServiceFactory = ReturnType<typeof delegatedApprovalDecisionServiceFactory>;

export const delegatedApprovalDecisionServiceFactory = ({
  delegatedApprovalRequestDAL,
  delegatedApprovalPolicyDAL,
  approvalPolicyDAL,
  approvalRequestDAL,
  appConnectionDAL,
  membershipDAL,
  kmsService,
  auditLogService,
  approvalResources,
  decisionNotifiers
}: TDelegatedApprovalDecisionServiceFactoryDep) => {
  const $audit = async (
    context: TDelegatedApprovalDecisionContext,
    metadata: TDelegatedApprovalDecisionAuditMetadata
  ) => {
    try {
      await auditLogService.createAuditLog({
        actor: { type: ActorType.PLATFORM, metadata: {} },
        orgId: context.approvalRequest.organizationId,
        projectId: context.approvalRequest.projectId,
        event: {
          type: EventType.ACCESS_APPROVAL_REQUEST_DELEGATED_DECISION,
          metadata: {
            requestId: context.approvalRequest.id,
            policyId: context.approvalRequest.policyId ?? "",
            ...(context.policyName ? { policyName: context.policyName } : {}),
            delegatedApprovalType: context.delegatedApprovalType,
            delegatedProviderRequestId: context.providerRequestId,
            ...(context.providerRecordNumber ? { providerRecordNumber: context.providerRecordNumber } : {}),
            ...(context.permissions ? { permissions: context.permissions } : {}),
            outcome: metadata.outcome,
            ...(metadata.decided
              ? {
                  decision: metadata.decided.decision,
                  decidedBy: metadata.decided.decidedBy ?? undefined,
                  decidedAt: metadata.decided.decidedAt ?? undefined,
                  decisionNotes: metadata.decided.notes ?? undefined
                }
              : {}),
            ...(metadata.reason ? { reason: metadata.reason } : {})
          }
        }
      });
    } catch (error) {
      logger.error(
        error,
        `Failed to record delegated approval decision audit log [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}]`
      );
    }
  };

  const $retryLater = async (
    delegatedRequestId: string,
    reason: string,
    isFinalAttempt: boolean
  ): Promise<TApplyDelegatedApprovalDecisionResult> => {
    const hint = isFinalAttempt ? DELEGATED_APPROVAL_DECISION_STOPPED_HINT : DELEGATED_APPROVAL_DECISION_RETRY_HINT;
    try {
      await delegatedApprovalRequestDAL.updateWithDetails(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.WaitingApproval },
        {
          ...(isFinalAttempt ? { decisionReadRequestedAt: null } : {}),
          details: { statusReason: toDelegatedApprovalStatusReason(`${reason} ${hint}`) }
        }
      );
    } catch (error) {
      logger.error(
        error,
        `Failed to record why the delegated approval decision is still pending [delegatedRequestId=${delegatedRequestId}]`
      );
    }

    if (isFinalAttempt) {
      logger.error(
        `Delegated approval decision attempts ran out, request left waiting for a new callback [delegatedRequestId=${delegatedRequestId}] [reason=${reason}]`
      );
      return { status: EventResultStatus.Failed, error: reason };
    }
    return { status: EventResultStatus.Retry, error: reason };
  };

  const $terminal = async (
    context: TDelegatedApprovalDecisionContext,
    reason: string
  ): Promise<TApplyDelegatedApprovalDecisionResult> => {
    try {
      await failDelegatedApprovalRequest(
        { id: context.delegatedRequestId, requestId: context.approvalRequest.id, reason },
        { approvalRequestDAL, delegatedApprovalRequestDAL }
      );
    } catch (error) {
      logger.error(
        error,
        `Failed to record delegated approval decision failure [delegatedRequestId=${context.delegatedRequestId}]`
      );
      throw error;
    }
    await $audit(context, { outcome: DelegatedApprovalDecisionOutcome.Failed, reason });
    logger.error(
      `Delegated approval decision failed [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}] [reason=${reason}]`
    );
    return { status: EventResultStatus.Failed, error: reason };
  };

  const $finalize = async (
    context: TDelegatedApprovalDecisionContext,
    decided: TDecidedDelegatedApprovalReadResult,
    postApprovalTxRoutine: TApprovalResource["postApprovalTxRoutine"]
  ): Promise<TDelegatedApprovalFinalizeOutcome> => {
    const outcome = await approvalRequestDAL.transaction(async (tx): Promise<TDelegatedApprovalFinalizeOutcome> => {
      const approvalRequestLocked = await approvalRequestDAL.findByIdForUpdate(context.approvalRequest.id, tx);
      if (!approvalRequestLocked) return { kind: "gone" };

      const isExpired = isApprovalRequestExpired(approvalRequestLocked);
      if (approvalRequestLocked.status !== ApprovalRequestStatus.Pending || isExpired) {
        const reason = isExpired
          ? `The decision from ${context.delegatedApprovalType} arrived after the request expired in Infisical. Create the request again.`
          : `The decision from ${context.delegatedApprovalType} arrived after the request was ${approvalRequestLocked.status} in Infisical.`;
        const failed = await failDelegatedApprovalRequest(
          {
            id: context.delegatedRequestId,
            requestId: approvalRequestLocked.id,
            reason,
            closeAs: ApprovalRequestStatus.Expired
          },
          { approvalRequestDAL, delegatedApprovalRequestDAL },
          tx
        );
        return failed ? { kind: "late", reason } : { kind: "raced" };
      }

      const isApproved = decided.decision === DelegatedApprovalDecision.Approved;
      const [finalized] = await delegatedApprovalRequestDAL.updateWithDetails(
        { id: context.delegatedRequestId, status: DelegatedApprovalRequestStatus.WaitingApproval },
        {
          status: isApproved ? DelegatedApprovalRequestStatus.Approved : DelegatedApprovalRequestStatus.Rejected,
          details: { statusReason: null }
        },
        tx
      );
      if (!finalized) return { kind: "raced" };

      await approvalRequestDAL.updateById(
        approvalRequestLocked.id,
        { status: isApproved ? ApprovalRequestStatus.Approved : ApprovalRequestStatus.Rejected },
        tx
      );
      if (isApproved) await postApprovalTxRoutine?.(approvalRequestLocked as TApprovalRequest, tx);
      return { kind: "applied" };
    });

    switch (outcome.kind) {
      case "applied":
        await $audit(context, { outcome: DelegatedApprovalDecisionOutcome.Applied, decided });
        logger.info(
          `Delegated approval decision applied [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}] [decision=${decided.decision}]`
        );
        break;
      case "late":
        await $audit(context, { outcome: DelegatedApprovalDecisionOutcome.Failed, reason: outcome.reason, decided });
        logger.warn(
          `Delegated approval decision arrived too late [delegatedRequestId=${context.delegatedRequestId}] [approvalRequestId=${context.approvalRequest.id}] [reason=${outcome.reason}]`
        );
        break;
      default:
        logger.info(
          `Delegated approval request was finalized while its decision was being read, skipping [delegatedRequestId=${context.delegatedRequestId}] [outcome=${outcome.kind}]`
        );
    }
    return outcome;
  };

  // Reads the decision back from the delegated approval system and finalizes the request. Retry
  // means the system has not recorded a decision yet and the caller should try again later; Failed
  // means the request was closed, or the last attempt ran out and only a new callback can read it again.
  const applyDecision = async ({
    delegatedRequestId,
    externalId,
    isFinalAttempt
  }: TApplyDelegatedApprovalDecisionDTO): Promise<TApplyDelegatedApprovalDecisionResult> => {
    const delegatedApprovalContext = await loadDelegatedApprovalContext(delegatedRequestId, {
      delegatedApprovalRequestDAL,
      approvalRequestDAL,
      delegatedApprovalPolicyDAL
    });
    if (!delegatedApprovalContext) {
      logger.warn(
        `Delegated approval request no longer exists, skipping decision [delegatedRequestId=${delegatedRequestId}]`
      );
      return { status: EventResultStatus.Delivered };
    }
    const { delegatedRequest, approvalRequest, delegatedPolicy } = delegatedApprovalContext;

    if (DELEGATED_APPROVAL_FINAL_STATE.has(delegatedRequest.status)) {
      logger.info(
        `Delegated approval request was already finalized, skipping decision [delegatedRequestId=${delegatedRequestId}] [status=${delegatedRequest.status}]`
      );
      return { status: EventResultStatus.Delivered };
    }
    if (delegatedRequest.status !== DelegatedApprovalRequestStatus.WaitingApproval) {
      logger.warn(
        `Delegated approval request is not awaiting a decision, skipping [delegatedRequestId=${delegatedRequestId}] [status=${delegatedRequest.status}]`
      );
      return { status: EventResultStatus.Delivered };
    }
    if (delegatedRequest.providerRequestId !== externalId) {
      const reason = `The callback named record '${externalId}' but the request is tracked as '${delegatedRequest.providerRequestId ?? "none"}'.`;
      logger.error(
        `Delegated approval callback does not match its request [delegatedRequestId=${delegatedRequestId}] ${reason}`
      );
      return { status: EventResultStatus.Failed, error: reason };
    }

    if (!approvalRequest) {
      logger.warn(
        `Approval request no longer exists, skipping delegated decision [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${delegatedRequest.requestId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    const delegatedApprovalName =
      delegatedPolicy && Object.hasOwn(DELEGATED_APPROVAL_NAME_MAP, delegatedPolicy.type)
        ? DELEGATED_APPROVAL_NAME_MAP[delegatedPolicy.type as DelegatedApprovalPolicyType]
        : undefined;

    const policy = approvalRequest.policyId ? await approvalPolicyDAL.findById(approvalRequest.policyId) : undefined;
    let permissions: string[] | undefined;
    if (isDelegatedApprovalSupportedPolicyType(approvalRequest.type)) {
      try {
        permissions = getDelegatedApprovalDispatchDetailsBuilder(approvalRequest.type)(approvalRequest).permissions;
      } catch (error) {
        logger.warn(
          error,
          `Could not read the permissions on the access request [approvalRequestId=${approvalRequest.id}]`
        );
      }
    }

    const context: TDelegatedApprovalDecisionContext = {
      delegatedRequestId,
      providerRequestId: delegatedRequest.providerRequestId,
      providerRecordNumber: delegatedRequest.details.provider?.recordNumber,
      policyName: policy?.name,
      permissions,
      approvalRequest,
      delegatedApprovalType: delegatedApprovalName ?? "the delegated approval system"
    };

    if (!approvalRequest.requesterId) {
      return $terminal(context, "The user who created this access request was deleted, so the request was cancelled.");
    }

    const isRequesterProjectMember = await membershipDAL.isUserProjectMember(
      { projectId: approvalRequest.projectId, userId: approvalRequest.requesterId },
      delegatedApprovalRequestDAL.primaryNode()
    );
    if (!isRequesterProjectMember) {
      return $terminal(
        context,
        "The user who created this access request is no longer a member of this project, so the request was cancelled."
      );
    }

    if (!delegatedPolicy) {
      return $terminal(
        context,
        "The policy's delegated approver was removed before its decision could be read. Configure a delegated approver on the policy and create the request again."
      );
    }

    if (!delegatedApprovalName) {
      return $terminal(
        context,
        `The delegated approval system '${delegatedPolicy.type}' is not supported. Create the request again.`
      );
    }

    const rawConnection = await appConnectionDAL.findById(
      delegatedPolicy.connectionId,
      delegatedApprovalRequestDAL.primaryNode()
    );
    const postApprovalTxRoutine = isDelegatedApprovalSupportedPolicyType(approvalRequest.type)
      ? approvalResources[approvalRequest.type]?.postApprovalTxRoutine
      : undefined;

    let decided: TDecidedDelegatedApprovalReadResult;
    try {
      const provider = getDelegatedApprovalProvider(delegatedPolicy.type);
      const connection = await decryptAppConnection(
        requireDelegatedApprovalConnection({
          rawConnection,
          delegatedPolicy,
          organizationId: approvalRequest.organizationId
        }),
        kmsService
      );
      const result = await provider.fetchDecision(
        { delegatedRequestId, approvalRequestId: approvalRequest.id, providerRequestId: context.providerRequestId },
        connection
      );

      if (result.status === "pending") {
        if (!isFinalAttempt) {
          logger.info(
            `Delegated approval decision not recorded yet, will check again [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}]`
          );
        }
        return await $retryLater(delegatedRequestId, result.reason, isFinalAttempt);
      }

      if (result.approvalRequestId && result.approvalRequestId !== approvalRequest.id) {
        throw new UnrecoverableError(
          `${delegatedApprovalName} returned the record of a different request ('${result.approvalRequestId}'). Create the request again.`
        );
      }

      if (result.decision === DelegatedApprovalDecision.Approved) {
        const buildDetails = getDelegatedApprovalDispatchDetailsBuilder(approvalRequest.type);
        const requested = normalizeDelegatedApprovalPermissions(buildDetails(approvalRequest).permissions);
        const approved = normalizeDelegatedApprovalPermissions(result.permissions);
        if (!haveSameDelegatedApprovalPermissions(requested, approved)) {
          throw new UnrecoverableError(
            `${delegatedApprovalName} approved different permissions than this request asked for. Requested: ${describeDelegatedApprovalPermissions(requested)}. Approved in ${delegatedApprovalName}: ${describeDelegatedApprovalPermissions(approved)}. The request was closed. Create the request again.`
          );
        }

        if (!postApprovalTxRoutine) {
          throw new UnrecoverableError(
            `Requests of type '${approvalRequest.type}' cannot be granted from a decision made in ${delegatedApprovalName}.`
          );
        }
      }

      decided = result;
    } catch (error) {
      const { terminal: isTerminal, message, logContext } = toDelegatedApprovalFailure(error);
      if (isTerminal) return $terminal(context, message);

      logger.warn(
        logContext,
        `Failed to read the delegated approval decision [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}] [isFinalAttempt=${isFinalAttempt}]`
      );
      return $retryLater(delegatedRequestId, message, isFinalAttempt);
    }

    let finalized: TDelegatedApprovalFinalizeOutcome;
    try {
      finalized = await $finalize(context, decided, postApprovalTxRoutine);
    } catch (error) {
      if (!isFinalAttempt) throw error;

      const { message, logContext } = toDelegatedApprovalFailure(error);
      logger.error(
        logContext,
        `Failed to apply the delegated approval decision [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}]`
      );
      return $retryLater(delegatedRequestId, message, isFinalAttempt);
    }
    if (finalized.kind === "applied" && isDelegatedApprovalSupportedPolicyType(approvalRequest.type)) {
      try {
        await decisionNotifiers[approvalRequest.type]({
          approvalRequestId: approvalRequest.id,
          decision: decided.decision
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to notify about the delegated approval decision [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}]`
        );
      }
    }
    return { status: EventResultStatus.Delivered };
  };

  return { applyDecision };
};
