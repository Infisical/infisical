import { UnrecoverableError } from "bullmq";

import { ProjectType } from "@app/db/schemas";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { APP_CONNECTION_NAME_MAP } from "@app/services/app-connection/app-connection-maps";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalCallbackServiceFactory } from "@app/services/delegated-approval-callback/delegated-approval-callback-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { DelegatedApprovalPolicyType, DelegatedApprovalRequestStatus } from "../delegated-approval-enums";
import { DELEGATED_APPROVAL_CONNECTION_MAP } from "../delegated-approval-maps";
import { TDelegatedApprovalPolicyDALFactory } from "../delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "../delegated-approval-request-dal";
import {
  DELEGATED_APPROVAL_DISPATCH_ATTEMPTS,
  DELEGATED_APPROVAL_DISPATCH_BACKOFF_MS,
  DELEGATED_APPROVAL_DISPATCH_CONCURRENCY,
  DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS
} from "./delegated-approval-dispatch-constants";
import {
  getDelegatedApprovalDispatchDetailsBuilder,
  getDelegatedApprovalProvider
} from "./delegated-approval-dispatch-fns";
import {
  TDelegatedApprovalDispatchInput,
  TDelegatedApprovalDispatchJobPayload
} from "./delegated-approval-dispatch-types";

type TDelegatedApprovalDispatchQueueFactoryDep = {
  delegatedApprovalRequestDAL: Pick<
    TDelegatedApprovalRequestDALFactory,
    "findById" | "primaryNode" | "update" | "updateById"
  >;
  delegatedApprovalPolicyDAL: Pick<TDelegatedApprovalPolicyDALFactory, "findOne">;
  delegatedApprovalCallbackService: Pick<
    TDelegatedApprovalCallbackServiceFactory,
    "getCallbackUrl" | "getOrIssueCallbackToken"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
};

export type TDelegatedApprovalDispatchQueueFactory = ReturnType<typeof delegatedApprovalDispatchQueueFactory>;

export const delegatedApprovalDispatchQueueFactory = ({
  delegatedApprovalRequestDAL,
  delegatedApprovalPolicyDAL,
  delegatedApprovalCallbackService,
  approvalRequestDAL,
  projectDAL,
  appConnectionDAL,
  kmsService,
  queueService
}: TDelegatedApprovalDispatchQueueFactoryDep) => {
  const $markDispatchFailed = async (delegatedRequestId: string, statusReason: string) => {
    try {
      await delegatedApprovalRequestDAL.update(
        { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.PendingDispatch },
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

  const queueDispatch = async ({ delegatedRequestId }: TDelegatedApprovalDispatchJobPayload) => {
    try {
      await queueService.queue(
        QueueName.DelegatedApprovalDispatch,
        QueueJobs.DelegatedApprovalDispatch,
        { delegatedRequestId },
        {
          jobId: `delegated-approval-dispatch-${delegatedRequestId}`,
          attempts: DELEGATED_APPROVAL_DISPATCH_ATTEMPTS,
          backoff: { type: "exponential", delay: DELEGATED_APPROVAL_DISPATCH_BACKOFF_MS },
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    } catch (error) {
      logger.error(error, `Failed to queue delegated approval dispatch [delegatedRequestId=${delegatedRequestId}]`);
      await $markDispatchFailed(
        delegatedRequestId,
        "Infisical could not schedule delivery to the delegated approval system."
      );
    }
  };

  // Both rows were committed together moments before the job runs, so they are read from the primary.
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

  const init = () => {
    queueService.start(
      QueueName.DelegatedApprovalDispatch,
      async (job) => {
        const { delegatedRequestId } = job.data;
        const attempt = job.attemptsMade + 1;
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinalAttempt = attempt >= maxAttempts;

        const requests = await $loadRequests(delegatedRequestId);
        if (!requests) {
          logger.warn(
            `Delegated approval request no longer exists, skipping dispatch [delegatedRequestId=${delegatedRequestId}]`
          );
          return;
        }

        const { delegatedRequest, approvalRequest, delegatedPolicy } = requests;

        if (
          delegatedRequest.status !== DelegatedApprovalRequestStatus.PendingDispatch &&
          delegatedRequest.status !== DelegatedApprovalRequestStatus.FailedDispatch
        ) {
          logger.info(
            `Delegated approval request is not awaiting dispatch, skipping [delegatedRequestId=${delegatedRequestId}] [status=${delegatedRequest.status}]`
          );
          return;
        }

        if (delegatedRequest.providerRequestId) {
          logger.info(
            `Delegated approval request was already delivered, skipping [delegatedRequestId=${delegatedRequestId}] [providerRequestId=${delegatedRequest.providerRequestId}]`
          );
          return;
        }

        if (delegatedRequest.status === DelegatedApprovalRequestStatus.FailedDispatch) {
          await delegatedApprovalRequestDAL.update(
            { id: delegatedRequestId, status: DelegatedApprovalRequestStatus.FailedDispatch },
            { status: DelegatedApprovalRequestStatus.PendingDispatch, statusReason: null }
          );
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
          if (!delegatedPolicy) {
            throw new UnrecoverableError(
              "The policy's delegated approver was removed before the request could be sent. Configure a delegated approver on the policy and create the request again."
            );
          }

          const provider = getDelegatedApprovalProvider(delegatedPolicy.type);
          const details = getDelegatedApprovalDispatchDetailsBuilder(approvalRequest.type)(approvalRequest);

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
            const connectionApp =
              DELEGATED_APPROVAL_CONNECTION_MAP[delegatedPolicy.type as DelegatedApprovalPolicyType];
            throw new UnrecoverableError(
              `App Connection with ID '${delegatedPolicy.connectionId}' was not found. Select a ${APP_CONNECTION_NAME_MAP[connectionApp]} Connection on the policy and create the request again.`
            );
          }

          const connection = await decryptAppConnection(rawConnection, kmsService);

          const callbackToken = await delegatedApprovalCallbackService.getOrIssueCallbackToken({
            delegatedRequest,
            orgId: approvalRequest.organizationId
          });
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
        } catch (error) {
          const isTerminal = isFinalAttempt || error instanceof UnrecoverableError;
          const message = error instanceof Error ? error.message : String(error);

          await $markDispatchFailed(delegatedRequestId, isTerminal ? message : `${message} Infisical will retry.`);

          const logContext = { err: { name: (error as Error)?.name, message } };
          const logMessage = `Delegated approval dispatch failed [delegatedRequestId=${delegatedRequestId}] [attempt=${attempt}/${maxAttempts}] [terminal=${isTerminal}]`;
          if (isTerminal) {
            logger.error(logContext, logMessage);
          } else {
            logger.warn(logContext, logMessage);
          }

          throw error;
        }
      },
      { concurrency: DELEGATED_APPROVAL_DISPATCH_CONCURRENCY }
    );
  };

  return { queueDispatch, init };
};
