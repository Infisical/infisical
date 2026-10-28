import { UnrecoverableError } from "bullmq";
import pLimit from "p-limit";

import { ProjectType } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalCallbackServiceFactory } from "@app/services/delegated-approval-callback/delegated-approval-callback-service";
import {
  EventResultStatus,
  IEventConsumer,
  MAX_OUTBOX_ATTEMPTS,
  TEvent,
  TEventConsumerResult
} from "@app/services/event-outbox/event-outbox-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "../delegated-approval-enums";
import {
  DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
  DelegatedApprovalDispatchRequestedPayloadSchema,
  TDelegatedApprovalDispatchRequestedPayload
} from "../delegated-approval-events";
import { DELEGATED_APPROVAL_CONNECTION_MAP } from "../delegated-approval-maps";
import { TDelegatedApprovalPolicyDALFactory } from "../delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "../delegated-approval-request-dal";
import { DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS } from "./delegated-approval-dispatch-constants";
import {
  getDelegatedApprovalDispatchDetailsBuilder,
  getDelegatedApprovalProvider
} from "./delegated-approval-dispatch-fns";
import { TDelegatedApprovalDispatchInput } from "./delegated-approval-dispatch-types";

export const DELEGATED_APPROVAL_DISPATCH_CONSUMER = "delegated-approval-dispatch";

const DELEGATED_APPROVAL_DISPATCH_CONCURRENCY = 10;

type TDelegatedApprovalDispatchConsumerDep = {
  delegatedApprovalRequestDAL: Pick<
    TDelegatedApprovalRequestDALFactory,
    "findById" | "primaryNode" | "transaction" | "update" | "updateById"
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
      await delegatedApprovalRequestDAL.update(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch, dispatchEventId: eventId },
        {
          status: DelegatedApprovalRequestStatus.FailedDispatch,
          statusReason: statusReason.slice(0, DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS)
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
        const [closed] = await delegatedApprovalRequestDAL.update(
          { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch, dispatchEventId: eventId },
          {
            status: DelegatedApprovalRequestStatus.Failed,
            statusReason: statusReason.slice(0, DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS)
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

  // Both rows were committed together with the event, so they are read from the primary.
  const $loadRequests = async (delegatedRequestId: string) => {
    const primary = delegatedApprovalRequestDAL.primaryNode();

    const delegatedRequest = await delegatedApprovalRequestDAL.findById(delegatedRequestId, primary);
    if (!delegatedRequest) return null;

    const approvalRequest = await approvalRequestDAL.findById(delegatedRequest.requestId, primary);
    const delegatedPolicy = approvalRequest?.policyId
      ? await delegatedApprovalPolicyDAL.findOne({ policyId: approvalRequest.policyId }, primary)
      : null;

    return { delegatedRequest, approvalRequest, delegatedPolicy };
  };

  const $dispatch = async (
    delegatedRequestId: string,
    eventId: string,
    isFinalAttempt: boolean
  ): Promise<Omit<TEventConsumerResult, "id">> => {
    const requests = await $loadRequests(delegatedRequestId);
    if (!requests) {
      logger.warn(
        `Delegated approval request no longer exists, skipping dispatch [delegatedRequestId=${delegatedRequestId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    const { delegatedRequest, approvalRequest, delegatedPolicy } = requests;

    if (delegatedRequest.dispatchEventId !== eventId) {
      logger.info(
        `Delegated approval dispatch was superseded by a newer resend, skipping [delegatedRequestId=${delegatedRequestId}] [eventId=${eventId}]`
      );
      return { status: EventResultStatus.Delivered };
    }

    if (
      delegatedRequest.status !== DelegatedApprovalRequestStatus.PendingDispatch &&
      delegatedRequest.status !== DelegatedApprovalRequestStatus.FailedDispatch
    ) {
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
      const [reopened] = await delegatedApprovalRequestDAL.update(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.FailedDispatch, dispatchEventId: eventId },
        { status: DelegatedApprovalRequestStatus.PendingDispatch, statusReason: null }
      );
      if (!reopened) {
        logger.info(
          `Delegated approval request was resent or closed before this dispatch started, skipping [delegatedRequestId=${delegatedRequestId}] [eventId=${eventId}]`
        );
        return { status: EventResultStatus.Delivered };
      }
    }

    try {
      if (!approvalRequest) {
        throw new UnrecoverableError("The approval request no longer exists.");
      }
      if (approvalRequest.status !== ApprovalRequestStatus.Pending) {
        throw new UnrecoverableError(
          "The approval request is no longer pending, so it was not sent to the delegated approval system."
        );
      }
      if (approvalRequest.expiresAt && new Date(approvalRequest.expiresAt) < new Date()) {
        throw new UnrecoverableError(
          "The approval request expired before it could be sent to the delegated approval system. Create the request again."
        );
      }
      if (!delegatedPolicy) {
        throw new UnrecoverableError(
          "The policy's delegated approver was removed before the request could be sent. Configure a delegated approver on the policy and create the request again."
        );
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
      if (!rawConnection || rawConnection.orgId !== approvalRequest.organizationId) {
        const connectionApp = DELEGATED_APPROVAL_CONNECTION_MAP[delegatedPolicy.type as DelegatedApprovalPolicyType];
        throw new UnrecoverableError(
          `App Connection with ID '${delegatedPolicy.connectionId}' was not found. Select a ${APP_CONNECTION_NAME_MAP[connectionApp]} Connection on the policy and create the request again.`
        );
      }

      const connection = await decryptAppConnection(rawConnection, kmsService);

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

      const { providerRequestId } = await provider.dispatch(input, connection);

      const [waitingRequest] = await delegatedApprovalRequestDAL.update(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch },
        { status: DelegatedApprovalRequestStatus.WaitingApproval, statusReason: null, providerRequestId }
      );
      if (!waitingRequest) {
        await delegatedApprovalRequestDAL.updateById(delegatedRequestId, { providerRequestId });
        logger.warn(
          `Delegated approval request left pending dispatch while it was being delivered [delegatedRequestId=${delegatedRequestId}] [providerRequestId=${providerRequestId}]`
        );
      }

      logger.info(
        `Delegated approval request delivered [delegatedRequestId=${delegatedRequestId}] [approvalRequestId=${approvalRequest.id}] [provider=${delegatedPolicy.type}] [providerRequestId=${providerRequestId}]`
      );
      return { status: EventResultStatus.Delivered };
    } catch (error) {
      const isTerminal = error instanceof UnrecoverableError;
      const message = error instanceof Error ? error.message : String(error);
      const logContext = { err: { name: (error as Error)?.name, message } };

      if (!isTerminal && isFinalAttempt && approvalRequest) {
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
        isTerminal
          ? message
          : `${message} Infisical will retry automatically. If it keeps failing, send the request again.`
      );

      const logMessage = `Delegated approval dispatch failed [delegatedRequestId=${delegatedRequestId}] [terminal=${isTerminal}]`;
      if (isTerminal) {
        logger.error(logContext, logMessage);
        return { status: EventResultStatus.Failed, error: message };
      }
      logger.warn(logContext, logMessage);
      return { status: EventResultStatus.Retry, error: message };
    }
  };

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { id } = event;

    const payload = DelegatedApprovalDispatchRequestedPayloadSchema.safeParse(event.data);
    if (!payload.success) {
      return {
        id,
        status: EventResultStatus.Failed,
        error: `Unreadable delegated approval dispatch payload: ${payload.error.issues.map((issue) => issue.message).join(", ")}`
      };
    }

    return { id, ...(await $dispatch(payload.data.delegatedRequestId, id, event.isFinalAttempt)) };
  };

  const $runEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    try {
      return await $handleEvent(event);
    } catch (error) {
      return {
        id: event.id,
        status: EventResultStatus.Retry,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  };

  // Unreadable payloads have no request id, so each one is its own group and cannot block another request.
  const $groupByRequest = (events: TEvent[]): TEvent[][] => {
    const groups: TEvent[][] = [];
    const indexByRequest = new Map<string, number>();

    events.forEach((event) => {
      const payload = DelegatedApprovalDispatchRequestedPayloadSchema.safeParse(event.data);
      const key = payload.success ? payload.data.delegatedRequestId : `event:${event.id}`;
      const existing = indexByRequest.get(key);
      if (existing === undefined) {
        indexByRequest.set(key, groups.length);
        groups.push([event]);
      } else {
        groups[existing].push(event);
      }
    });

    return groups;
  };

  const handle = async (events: TEvent[]): Promise<TEventConsumerResult[]> => {
    const limit = pLimit(DELEGATED_APPROVAL_DISPATCH_CONCURRENCY);

    const groupResults = await Promise.all(
      $groupByRequest(events).map((group) =>
        limit(async () => {
          const results: TEventConsumerResult[] = [];
          for (const event of group) {
            // eslint-disable-next-line no-await-in-loop -- two events for one request must not both pass the providerRequestId check
            results.push(await $runEvent(event));
          }
          return results;
        })
      )
    );

    return groupResults.flat();
  };

  return {
    name: DELEGATED_APPROVAL_DISPATCH_CONSUMER,
    dataSchema: DelegatedApprovalDispatchRequestedPayloadSchema,
    subscribesTo: (type: string) => type === DELEGATED_APPROVAL_DISPATCH_REQUESTED_EVENT,
    handle
  };
};
