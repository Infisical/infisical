import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";

import { PamSessionEndReason } from "../pam/pam-enums";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { reportPamSessionEnded } from "./pam-session-fns";

type TPamSessionExpirationServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "endSessionById">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TPamSessionExpirationServiceFactory = ReturnType<typeof pamSessionExpirationServiceFactory>;

export const pamSessionExpirationServiceFactory = ({
  queueService,
  pamSessionDAL,
  telemetryService
}: TPamSessionExpirationServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.PamSessionExpiration, async (job) => {
      const { sessionId, orgId } = job.data;
      try {
        logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: expiring session [sessionId=${sessionId}]`);
        const updated = await pamSessionDAL.endSessionById(sessionId);
        if (updated) {
          logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: session expired [sessionId=${sessionId}]`);
          if (orgId) {
            reportPamSessionEnded({
              session: updated,
              orgId,
              endReason: PamSessionEndReason.Expired,
              telemetryService
            });
          }
        } else {
          logger.info(
            { sessionId },
            `${QueueName.PamSessionExpiration}: session already ended or not found [sessionId=${sessionId}]`
          );
        }
      } catch (error) {
        logger.error(error, `${QueueName.PamSessionExpiration}: failed to expire session [sessionId=${sessionId}]`);
        throw error;
      }
    });
  };

  const scheduleSessionExpiration = async (sessionId: string, expiresAt: Date, orgId: string) => {
    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());

    await queueService.queue(
      QueueName.PamSessionExpiration,
      QueueJobs.PamSessionExpiration,
      { sessionId, orgId },
      {
        jobId: `pam-session-expiration-${sessionId}`,
        delay: delayMs
      }
    );

    logger.info(
      { sessionId, expiresAt: expiresAt.toISOString(), delayMs },
      `${QueueName.PamSessionExpiration}: scheduled expiration [sessionId=${sessionId}]`
    );
  };

  return {
    init,
    scheduleSessionExpiration
  };
};
