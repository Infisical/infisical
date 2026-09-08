import { UnrecoverableError } from "bullmq";

import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TAccessApprovalRequestDALFactory } from "../access-approval-request/access-approval-request-dal";
import { ExternalApprovalRequestStatus } from "./external-approval-enums";
import { getExternalApprovalProviderFns } from "./external-approval-fns";
import { TExternalApprovalPolicyDALFactory } from "./external-approval-policy-dal";
import { TExternalApprovalRequestDALFactory } from "./external-approval-request-dal";
import { TExternalApprovalDispatchJobPayload } from "./external-approval-types";

type TExternalApprovalQueueFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  externalApprovalRequestDAL: Pick<TExternalApprovalRequestDALFactory, "findById" | "updateById">;
  externalApprovalPolicyDAL: Pick<TExternalApprovalPolicyDALFactory, "findById">;
  accessApprovalRequestDAL: Pick<TAccessApprovalRequestDALFactory, "findById" | "transaction">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TExternalApprovalQueueFactory = ReturnType<typeof externalApprovalQueueFactory>;

export const externalApprovalQueueFactory = ({
  queueService,
  externalApprovalRequestDAL,
  externalApprovalPolicyDAL,
  accessApprovalRequestDAL,
  appConnectionDAL,
  projectDAL,
  kmsService
}: TExternalApprovalQueueFactoryDep) => {
  const queueExternalApprovalDispatch = async (payload: TExternalApprovalDispatchJobPayload) => {
    await queueService.queue(QueueName.ExternalApprovalDispatch, QueueJobs.ExternalApprovalDispatch, payload, {
      jobId: `external-approval-dispatch-${payload.externalApprovalRequestId}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: true
    });
  };

  queueService.start(QueueName.ExternalApprovalDispatch, async (job) => {
    const { externalApprovalRequestId, accessApprovalRequestId, projectId } = job.data;
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = attempt >= maxAttempts;
    const logDetails = `[externalApprovalRequestId=${externalApprovalRequestId}] [accessApprovalRequestId=${accessApprovalRequestId}] [jobId=${job.id}] [attempt=${attempt}/${maxAttempts}]`;

    const externalApprovalRequest = await externalApprovalRequestDAL.findById(externalApprovalRequestId);
    if (!externalApprovalRequest) {
      logger.warn(`externalApprovalQueue: External approval request not found, skipping ${logDetails}`);
      return;
    }
    if (externalApprovalRequest.status !== ExternalApprovalRequestStatus.PendingDispatch) {
      logger.info(
        `externalApprovalQueue: External approval request is not pending dispatch, skipping ${logDetails} [status=${externalApprovalRequest.status}]`
      );
      return;
    }

    try {
      const accessApprovalRequest = await accessApprovalRequestDAL.transaction((tx) =>
        accessApprovalRequestDAL.findById(accessApprovalRequestId, tx)
      );
      if (!accessApprovalRequest) {
        throw new UnrecoverableError("Access approval request no longer exists");
      }
      if (!accessApprovalRequest.policy.externalApprovalPolicyId) {
        throw new UnrecoverableError("Access approval policy has no external approval configured");
      }

      const externalApprovalPolicy = await externalApprovalPolicyDAL.findById(
        accessApprovalRequest.policy.externalApprovalPolicyId
      );
      if (!externalApprovalPolicy) {
        throw new UnrecoverableError("External approval policy no longer exists");
      }

      const appConnection = await appConnectionDAL.findById(externalApprovalPolicy.connectionId);
      if (!appConnection) {
        throw new UnrecoverableError("App connection for the external approval no longer exists");
      }
      const connection = await decryptAppConnection(appConnection, kmsService);

      const project = await projectDAL.findById(projectId);
      if (!project) {
        throw new UnrecoverableError("Project no longer exists");
      }

      const providerFns = getExternalApprovalProviderFns(externalApprovalPolicy.type);
      const { externalId } = await providerFns.dispatch({
        externalApprovalRequest,
        externalApprovalPolicy,
        accessApprovalRequest,
        connection,
        project
      });

      await externalApprovalRequestDAL.updateById(externalApprovalRequestId, {
        status: ExternalApprovalRequestStatus.WaitingApproval,
        externalId
      });

      logger.info(`externalApprovalQueue: Dispatched external approval request ${logDetails}`);
    } catch (error) {
      const isUnrecoverable = error instanceof UnrecoverableError;
      logger.error(
        error,
        `externalApprovalQueue: Failed to dispatch external approval request ${logDetails} [isFinalAttempt=${isFinalAttempt}] [isUnrecoverable=${isUnrecoverable}]`
      );

      if (isFinalAttempt || isUnrecoverable) {
        await externalApprovalRequestDAL.updateById(externalApprovalRequestId, {
          status: ExternalApprovalRequestStatus.FailedDispatch
        });
      }

      throw error;
    }
  });

  return { queueExternalApprovalDispatch };
};
