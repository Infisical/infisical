import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamSessionEndReason } from "../pam/pam-enums";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { reportPamSessionEnded } from "./pam-session-fns";

type TPamSessionExpirationServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "endSessionById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export type TPamSessionExpirationServiceFactory = ReturnType<typeof pamSessionExpirationServiceFactory>;

export const pamSessionExpirationServiceFactory = ({
  queueService,
  pamSessionDAL,
  projectDAL,
  telemetryService,
  userDAL
}: TPamSessionExpirationServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.PamSessionExpiration, async (job) => {
      const { sessionId } = job.data;
      try {
        logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: expiring session [sessionId=${sessionId}]`);
        const updated = await pamSessionDAL.endSessionById(sessionId);
        if (updated) {
          logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: session expired [sessionId=${sessionId}]`);

          // Session rows carry no orgId, and PAM is one project per org, so resolve it from the project.
          const project = await projectDAL.findById(updated.projectId);
          if (project?.orgId) {
            void reportPamSessionEnded({
              session: updated,
              orgId: project.orgId,
              endReason: PamSessionEndReason.Expired,
              telemetryService,
              userDAL
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

  const scheduleSessionExpiration = async (sessionId: string, expiresAt: Date) => {
    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());

    await queueService.queue(
      QueueName.PamSessionExpiration,
      QueueJobs.PamSessionExpiration,
      { sessionId },
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
