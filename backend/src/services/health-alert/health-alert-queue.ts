import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TRelayServiceFactory } from "@app/ee/services/relay/relay-service";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

type THealthAlertServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "healthcheckNotify">;
  relayService: Pick<TRelayServiceFactory, "healthcheckNotify">;
};

export type THealthAlertServiceFactory = ReturnType<typeof healthAlertServiceFactory>;

export const healthAlertServiceFactory = ({
  queueService,
  gatewayV2Service,
  relayService
}: THealthAlertServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.stopRepeatableJob(
      QueueName.HealthAlert,
      QueueJobs.HealthAlert,
      { pattern: "*/5 * * * *", utc: true },
      QueueName.HealthAlert // job id
    );

    queueService.start(
      QueueName.HealthAlert,
      async () => {
        try {
          logger.info(`${QueueName.HealthAlert}: health check alert task started`);
          await gatewayV2Service.healthcheckNotify();
          await relayService.healthcheckNotify();
          logger.info(`${QueueName.HealthAlert}: health check alert task completed`);
        } catch (error) {
          logger.error(error, `${QueueName.HealthAlert}: health check alert failed`);
          throw error;
        }
      },
      {
        persistence: true
      }
    );

    await queueService.schedulePg(
      QueueJobs.HealthAlert,
      "*/5 * * * *", // Schedule to run every 5 minutes
      undefined,
      { tz: "UTC" }
    );
  };

  return {
    init
  };
};
