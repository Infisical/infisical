import opentelemetry from "@opentelemetry/api";

import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountRotationServiceFactory } from "./pam-account-rotation-service";

const ROTATION_DISCOVERY_BATCH = 100;

type TPamAccountRotationQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findAccountsToRotate" | "countAccountsToRotate">;
  pamAccountRotationService: Pick<TPamAccountRotationServiceFactory, "rotateScheduledAccount">;
};

export const pamAccountRotationQueueServiceFactory = async ({
  queueService,
  cronJob,
  auditLogService,
  pamAccountDAL,
  pamAccountRotationService
}: TPamAccountRotationQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const meter = opentelemetry.metrics.getMeter("InfisicalCore");
  const pendingGauge = meter.createObservableGauge("infisical.pam_credential_rotation.pending", {
    description: "PAM accounts overdue for rotation (nextRotationAt <= now). Sustained growth = drain can't keep up.",
    unit: "{account}"
  });
  pendingGauge.addCallback(async (observableResult) => {
    if (!appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    try {
      observableResult.observe(await pamAccountDAL.countAccountsToRotate(new Date()));
    } catch (err) {
      logger.warn({ err }, "pam_credential_rotation.pending gauge: count failed");
    }
  });

  queueService.start(
    QueueName.PamCredentialRotationRotate,
    async (job) => {
      const result = await pamAccountRotationService.rotateScheduledAccount(job.data.accountId);
      if (result) {
        await auditLogService.createAuditLog({
          projectId: result.projectId,
          actor: { type: ActorType.PLATFORM, metadata: {} },
          event: {
            type: EventType.PAM_ACCOUNT_ROTATE_CREDENTIALS,
            metadata: {
              accountId: job.data.accountId,
              accountType: result.accountType,
              rotationStatus: result.rotationStatus,
              manual: false,
              rotationAccountId: result.rotationAccountId,
              ...(result.message ? { message: result.message } : {})
            }
          }
        });
      }
    },
    { concurrency: 5, limiter: { max: 5, duration: 1000 } }
  );

  queueService.start(QueueName.PamCredentialRotation, async () => {
    const due = await pamAccountDAL.findAccountsToRotate(new Date(), ROTATION_DISCOVERY_BATCH);
    for (const account of due) {
      // eslint-disable-next-line no-await-in-loop
      await queueService.queue(
        QueueName.PamCredentialRotationRotate,
        QueueJobs.PamCredentialRotationRotate,
        { accountId: account.id },
        {
          // No attempts/backoff: failures reschedule via nextRotationAt, so BullMQ retries would only re-audit.
          // jobId dedupes a due account that's still queued.
          jobId: `pam-credential-rotation-${account.id}`,
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    }
  });

  cronJob.register({
    name: CronJobName.PamCredentialRotationQueueRotations,
    pattern: appCfg.isRotationDevelopmentMode ? "* * * * *" : "*/5 * * * *",
    runHashTtlS: 30 * 60,
    handler: async () => {
      await queueService.queue(
        QueueName.PamCredentialRotation,
        QueueJobs.PamCredentialRotationQueueRotations,
        undefined,
        { jobId: CronJobName.PamCredentialRotationQueueRotations }
      );
    }
  });
};
