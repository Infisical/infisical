import { logger } from "@app/lib/logger";
import { QueueName, TQueueServiceFactory } from "@app/queue";

import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { TAuditLogStreamOutboxServiceFactory } from "./audit-log-stream-outbox-service";

export type TAuditLogStreamOutboxQueueDep = {
  queueService: TQueueServiceFactory;
  auditLogStreamOutboxService: Pick<TAuditLogStreamOutboxServiceFactory, "drainStream">;
};

// Boots one BullMQ worker per provider so a slow upstream (e.g. a wedged
// Splunk HEC) can't block deliveries to a healthy one (e.g. Datadog).
export const auditLogStreamOutboxQueueFactory = ({
  queueService,
  auditLogStreamOutboxService
}: TAuditLogStreamOutboxQueueDep) => {
  const registerWorker = <T extends QueueName>(queueName: T, provider: LogProvider) => {
    queueService.start(queueName, async (job) => {
      const { streamId, orgId } = job.data as { streamId: string; orgId: string };
      try {
        await auditLogStreamOutboxService.drainStream({ streamId, orgId, provider });
      } catch (error) {
        logger.error(
          error,
          `audit-log-stream-outbox: flush worker crashed [provider=${provider}] [streamId=${streamId}] [orgId=${orgId}]`
        );
        throw error;
      }
    });
  };

  registerWorker(QueueName.AuditLogStreamAzure, LogProvider.Azure);
  registerWorker(QueueName.AuditLogStreamCribl, LogProvider.Cribl);
  registerWorker(QueueName.AuditLogStreamCustom, LogProvider.Custom);
  registerWorker(QueueName.AuditLogStreamDatadog, LogProvider.Datadog);
  registerWorker(QueueName.AuditLogStreamSplunk, LogProvider.Splunk);
};
