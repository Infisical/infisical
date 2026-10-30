import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { resolveCoreMeter } from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamAccountHeartbeatServiceFactory } from "./pam-account-heartbeat-service";

const HEARTBEAT_DISCOVERY_BATCH = 100;

type TPamAccountHeartbeatQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  cronJob: TCronJobFactory;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  pamAccountDAL: Pick<TPamAccountDALFactory, "findAccountsToHeartbeat" | "countAccountsToHeartbeat">;
  pamAccountHeartbeatService: Pick<TPamAccountHeartbeatServiceFactory, "checkScheduledAccount">;
};

export const pamAccountHeartbeatQueueServiceFactory = async ({
  queueService,
  cronJob,
  auditLogService,
  pamAccountDAL,
  pamAccountHeartbeatService
}: TPamAccountHeartbeatQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const meter = resolveCoreMeter();
  const pendingGauge = meter.createObservableGauge("infisical.pam_heartbeat.pending", {
    description: "PAM accounts overdue for a credential check (nextHeartbeatAt <= now).",
    unit: "{account}"
  });
  pendingGauge.addCallback(async (observableResult) => {
    if (!appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) return;
    try {
      observableResult.observe(await pamAccountDAL.countAccountsToHeartbeat(new Date()));
    } catch (err) {
      logger.warn({ err }, "pam_heartbeat.pending gauge: count failed");
    }
  });

  queueService.start(
    QueueName.PamHeartbeatCheck,
    async (job) => {
      const result = await pamAccountHeartbeatService.checkScheduledAccount(job.data.accountId);
      if (result) {
        await auditLogService.createAuditLog({
          projectId: result.projectId,
          actor: { type: ActorType.PLATFORM, metadata: {} },
          event: {
            type: EventType.PAM_ACCOUNT_HEARTBEAT,
            metadata: {
              accountId: job.data.accountId,
              accountName: result.accountName,
              accountType: result.accountType,
              heartbeatStatus: result.status,
              manual: false,
              ...(result.message ? { message: result.message } : {})
            }
          }
        });
      }
    },
    { concurrency: 5, limiter: { max: 5, duration: 1000 } }
  );

  queueService.start(QueueName.PamHeartbeat, async () => {
    const due = await pamAccountDAL.findAccountsToHeartbeat(new Date(), HEARTBEAT_DISCOVERY_BATCH);
    for (const account of due) {
      // eslint-disable-next-line no-await-in-loop
      await queueService.queue(
        QueueName.PamHeartbeatCheck,
        QueueJobs.PamHeartbeatCheck,
        { accountId: account.id },
        {
          // Failures reschedule through nextHeartbeatAt, so BullMQ retries would only re-audit the same result.
          jobId: `pam-heartbeat-${account.id}`,
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    }
  });

  cronJob.register({
    name: CronJobName.PamHeartbeatQueueChecks,
    pattern: "*/5 * * * *",
    runHashTtlS: 30 * 60,
    handler: async () => {
      await queueService.queue(QueueName.PamHeartbeat, QueueJobs.PamHeartbeatQueueChecks, undefined, {
        jobId: CronJobName.PamHeartbeatQueueChecks
      });
    }
  });
};
