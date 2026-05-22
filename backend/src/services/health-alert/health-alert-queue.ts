import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TRelayServiceFactory } from "@app/ee/services/relay/relay-service";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

type THealthAlertServiceFactoryDep = {
  cronJob: TCronJobFactory;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "healthcheckNotify">;
  relayService: Pick<TRelayServiceFactory, "healthcheckNotify">;
};

export type THealthAlertServiceFactory = ReturnType<typeof healthAlertServiceFactory>;

export const healthAlertServiceFactory = ({
  cronJob,
  gatewayV2Service,
  relayService
}: THealthAlertServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    cronJob.register({
      name: CronJobName.HealthAlert,
      pattern: "*/5 * * * *",
      runHashTtlS: 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[health-alert]: health check task started");
        await gatewayV2Service.healthcheckNotify();
        await relayService.healthcheckNotify();
      }
    });
  };

  return {
    init
  };
};
