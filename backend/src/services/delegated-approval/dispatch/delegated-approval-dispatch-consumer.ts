import { UnrecoverableError } from "bullmq";

import { ProjectType } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalCallbackServiceFactory } from "@app/services/delegated-approval-callback/delegated-approval-callback-service";
import { parseEventPayload, runEventsConcurrentlyByKey } from "@app/services/event-outbox/event-outbox-fns";
import {
  EventResultStatus,
  IEventConsumer,
  MAX_OUTBOX_ATTEMPTS,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { DelegatedApprovalRequestStatus } from "../delegated-approval-enums";
import {
  DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
  DelegatedApprovalDispatchRequestedPayloadSchema,
  TDelegatedApprovalDispatchRequestedPayload
} from "../delegated-approval-events";
import {
  DelegatedApprovalRequestBlocker,
  getDelegatedApprovalRequestBlocker,
  requireDelegatedApprovalConnection
} from "../delegated-approval-guards";
import { TDelegatedApprovalPolicyDALFactory } from "../delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "../delegated-approval-request-dal";
import {
  loadDelegatedApprovalContext,
  toDelegatedApprovalFailure,
  toDelegatedApprovalStatusReason
} from "../delegated-approval-request-fns";
import { DELEGATED_APPROVAL_DISPATCH_RETRY_HINT } from "./delegated-approval-dispatch-constants";
import {
  getDelegatedApprovalDispatchDetailsBuilder,
  getDelegatedApprovalProvider
} from "./delegated-approval-dispatch-fns";
import { TDelegatedApprovalDispatchInput } from "./delegated-approval-dispatch-types";

export const DELEGATED_APPROVAL_DISPATCH_CONSUMER = "delegated-approval-dispatch";

const DELEGATED_APPROVAL_DISPATCH_CONCURRENCY = 10;

const BLOCKER_MESSAGES: Record<DelegatedApprovalRequestBlocker, string> = {
  [DelegatedApprovalRequestBlocker.Missing]: "The approval request no longer exists.",
  [DelegatedApprovalRequestBlocker.NotPending]:
    "The approval request is no longer pending, so it was not sent to the delegated approval system.",
  [DelegatedApprovalRequestBlocker.Expired]:
    "The approval request expired before it could be sent to the delegated approval system. Create the request again.",
  [DelegatedApprovalRequestBlocker.PolicyRemoved]:
    "The policy's delegated approver was removed before the request could be sent. Configure a delegated approver on the policy and create the request again."
};

type TDelegatedApprovalDispatchConsumerDep = {
  delegatedApprovalRequestDAL: Pick<
    TDelegatedApprovalRequestDALFactory,
    "findById" | "primaryNode" | "transaction" | "updateWithDetails"
  >;
  delegatedApprovalPolicyDAL: Pick<TDelegatedApprovalPolicyDALFactory, "findOne">;
  delegatedApprovalCallbackService: Pick<
    TDelegatedApprovalCallbackServiceFactory,
    "getCallbackUrl" | "getOrIssueCallbackToken"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById" | "update">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TDelegatedApprovalDispatchConsumer = ReturnType<typeof delegatedApprovalDispatchConsumerFactory>;

export const delegatedApprovalDispatchConsumerFactory = ({
  delegatedApprovalRequestDAL,
  delegatedApprovalPolicyDAL,
  delegatedApprovalCallbackService,
  approvalRequestDAL,
  projectDAL,
  appConnectionDAL,
  kmsService
}: TDelegatedApprovalDispatchConsumerDep): IEventConsumer<TDelegatedApprovalDispatchRequestedPayload> => {
  const $markDispatchFailed = async (delegatedRequestId: string, eventId: string, statusReason: string) => {
    try {
      await delegatedApprovalRequestDAL.updateWithDetails(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch, dispatchEventId: eventId },
        {
          status: DelegatedApprovalRequestStatus.FailedDispatch,
          details: { statusReason: toDelegatedApprovalStatusReason(statusReason) }
        }
      );
    } catch (error) {
      logger.error(
        error,
        `Failed to record delegated approval dispatch failure [delegatedRequestId=${delegatedRequestId}]`
      );
    }
  };

  const $closeAfterExhaustedAttempts = async ({
    delegatedRequestId,
    eventId,
    approvalRequestId,
    statusReason
  }: {
    delegatedRequestId: string;
    eventId: string;
    approvalRequestId: string;
    statusReason: string;
  }) => {
    try {
      await delegatedApprovalRequestDAL.transaction(async (tx) => {
        const [closed] = await delegatedApprovalRequestDAL.updateWithDetails(
          { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch, dispatchEventId: eventId },
          {
            status: DelegatedApprovalRequestStatus.Failed,
            details: { statusReason: toDelegatedApprovalStatusReason(statusReason) }
          },
          tx
        );
        if (!closed) return;

        await approvalRequestDAL.update(
          { id: approvalRequestId, status: ApprovalRequestStatus.Pending },
          { status: ApprovalRequestStatus.Cancelled },
          tx
        );
      });
    } catch (error) {
      logger.error(
        error,
        `Failed to close a delegated approval request whose dispatch attempts ran out [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequestId}]`
      );
    }
  };

  const $dispatch = async (
    delegatedRequestId: string,
    eventId: string,
    isFinalAttempt: boolean
  ): Promise<Omit<TEventConsumerResult, "id">> => {
    const context = await loadDelegatedApprovalContext(delegatedRequestId, {
      delegatedApprovalRequestDAL,
      approvalRequestDAL,
      delegatedApprovalPolicyDAL
    });
    if (!context) {
      logger.warn(
        `Delegated approval request no longer exists, skipping dispatch [delegatedRequestId=${delegatedRequestId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    const { delegatedRequest, approvalRequest, delegatedPolicy } = context;

    if (delegatedRequest.dispatchEventId !== eventId) {
      logger.info(
        `Delegated approval dispatch was superseded by a newer resend, skipping [delegatedRequestId=${delegatedRequestId}] [eventId=${eventId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    const canDispatch =
      delegatedRequest.status === DelegatedApprovalRequestStatus.PendingDispatch ||
      delegatedRequest.status === DelegatedApprovalRequestStatus.FailedDispatch;

    if (!canDispatch) {
      logger.info(
        `Delegated approval request is not awaiting dispatch, skipping [delegatedRequestId=${delegatedRequestId}] [status=${delegatedRequest.status}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    if (delegatedRequest.providerRequestId) {
      logger.info(
        `Delegated approval request was already delivered, skipping [delegatedRequestId=${delegatedRequestId}] [providerRequestId=${delegatedRequest.providerRequestId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    if (delegatedRequest.status === DelegatedApprovalRequestStatus.FailedDispatch) {
      const [reopened] = await delegatedApprovalRequestDAL.updateWithDetails(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.FailedDispatch, dispatchEventId: eventId },
        { status: DelegatedApprovalRequestStatus.PendingDispatch, details: { statusReason: null } }
      );
      if (!reopened) {
        logger.info(
          `Delegated approval request was resent or closed before this dispatch started, skipping [delegatedRequestId=${delegatedRequestId}] [eventId=${eventId}]`
        );
        return { status: EventResultStatus.Delivered };
      }
    }

    try {
      const blocker = getDelegatedApprovalRequestBlocker(approvalRequest, delegatedPolicy);
      if (blocker || !approvalRequest || !delegatedPolicy) {
        throw new UnrecoverableError(BLOCKER_MESSAGES[blocker ?? DelegatedApprovalRequestBlocker.Missing]);
      }

      const provider = getDelegatedApprovalProvider(delegatedPolicy.type);
      const buildDetails = getDelegatedApprovalDispatchDetailsBuilder(approvalRequest.type);
      const details = buildDetails(approvalRequest);

      const callbackUrl = delegatedApprovalCallbackService.getCallbackUrl();
      if (!callbackUrl) {
        throw new UnrecoverableError(
          "SITE_URL must be configured so the delegated approval system can call Infisical back."
        );
      }

      const primary = delegatedApprovalRequestDAL.primaryNode();
      const [project, rawConnection] = await Promise.all([
        projectDAL.findById(approvalRequest.projectId, primary),
        appConnectionDAL.findById(delegatedPolicy.connectionId, primary)
      ]);
      if (!project) {
        throw new UnrecoverableError("The project of the approval request no longer exists.");
      }

      const connection = await decryptAppConnection(
        requireDelegatedApprovalConnection({
          rawConnection,
          delegatedPolicy,
          organizationId: approvalRequest.organizationId
        }),
        kmsService
      );

      const callbackToken = await delegatedApprovalCallbackService.getOrIssueCallbackToken({ delegatedRequest });
      if (!callbackToken) {
        throw new UnrecoverableError(
          "A callback token could not be issued for this request. Create the request again."
        );
      }

      const input: TDelegatedApprovalDispatchInput = {
        delegatedRequestId,
        approvalRequestId: approvalRequest.id,
        organizationId: approvalRequest.organizationId,
        productType: project.type as ProjectType,
        project: { id: project.id, name: project.name },
        requester: { name: approvalRequest.requesterName, email: approvalRequest.requesterEmail },
        justification: approvalRequest.justification ?? null,
        callback: { url: callbackUrl, token: callbackToken },
        details
      };

      const { providerRequestId, providerDetails } = await provider.dispatch(input, connection);
      const providerPatch = providerDetails ? { provider: providerDetails } : {};

      const [waitingRequest] = await delegatedApprovalRequestDAL.updateWithDetails(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch },
        {
          status: DelegatedApprovalRequestStatus.WaitingApproval,
          providerRequestId,
          details: { statusReason: null, ...providerPatch }
        }
      );
      if (!waitingRequest) {
        await delegatedApprovalRequestDAL.updateWithDetails(
          { id: delegatedRequestId },
          { providerRequestId, details: providerPatch }
        );
        logger.warn(
          `Delegated approval request left pending dispatch while it was being delivered [delegatedRequestId=${delegatedRequestId}] [providerRequestId=${providerRequestId}]`
        );
      }

      logger.info(
        `Delegated approval request delivered [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}] [provider=${delegatedPolicy.type}] [providerRequestId=${providerRequestId}] [recordNumber=${providerDetails?.recordNumber ?? "none"}]`
      );
      return { status: EventResultStatus.Delivered };
    } catch (error) {
      const { terminal, message, logContext } = toDelegatedApprovalFailure(error);

      if (!terminal && isFinalAttempt && approvalRequest) {
        await $closeAfterExhaustedAttempts({
          delegatedRequestId,
          eventId,
          approvalRequestId: approvalRequest.id,
          statusReason: `${message} Infisical could not send this request after ${MAX_OUTBOX_ATTEMPTS} attempts and closed it. Create a new request.`
        });
        logger.error(
          logContext,
          `Delegated approval dispatch attempts ran out, request closed [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}]`
        );
        return { status: EventResultStatus.Failed, error: message };
      }

      // The row is failed_dispatch throughout, which is what makes the manual resend available while the
      // outbox is still retrying.
      await $markDispatchFailed(
        delegatedRequestId,
        eventId,
        terminal ? message : `${message} ${DELEGATED_APPROVAL_DISPATCH_RETRY_HINT}`
      );

      const logMessage = `Delegated approval dispatch failed [delegatedRequestId=${delegatedRequestId}] [terminal=${terminal}]`;
      if (terminal) {
        logger.error(logContext, logMessage);
        return { status: EventResultStatus.Failed, error: message };
      }
      logger.warn(logContext, logMessage);
      return { status: EventResultStatus.Retry, error: message };
    }
  };

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { data, failure } = parseEventPayload(
      event,
      DelegatedApprovalDispatchRequestedPayloadSchema,
      "delegated approval dispatch"
    );
    if (failure) return failure;

    return { id: event.id, ...(await $dispatch(data.delegatedRequestId, event.id, event.isFinalAttempt)) };
  };

  // Events for one request run serially, so two of them cannot both pass the providerRequestId check.
  const handle = (events: TEvent[]): Promise<TEventConsumerResult[]> =>
    runEventsConcurrentlyByKey(events, {
      keyOf: (event) => DelegatedApprovalDispatchRequestedPayloadSchema.safeParse(event.data).data?.delegatedRequestId,
      concurrency: DELEGATED_APPROVAL_DISPATCH_CONCURRENCY,
      handleEvent: $handleEvent
    });

  return {
    name: DELEGATED_APPROVAL_DISPATCH_CONSUMER,
    dataSchema: DelegatedApprovalDispatchRequestedPayloadSchema,
    subscribesTo: (type: string) => type === DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
    handle
  };
};
