import { TPamAccountServiceFactory } from "@app/ee/services/pam-account/pam-account-service";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";

type TPamAccountRotationServiceFactoryDep = {
  cronJob: TCronJobFactory;
  pamAccountService: Pick<TPamAccountServiceFactory, "rotateAllDueAccounts">;
};

export type TPamAccountRotationServiceFactory = ReturnType<typeof pamAccountRotationServiceFactory>;

export const pamAccountRotationServiceFactory = ({
  cronJob,
  pamAccountService
}: TPamAccountRotationServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = () => {
    cronJob.register({
      name: CronJobName.PamAccountRotation,
      pattern: "0 * * * *",
      runHashTtlS: 1 * 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[pam-account-rotation]: task started");
        await pamAccountService.rotateAllDueAccounts();
      }
    });
  };

  return {
    init
  };
};
