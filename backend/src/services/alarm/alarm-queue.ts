import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAlarmDALFactory } from "./alarm-dal";
import { TAlarmEngine } from "./alarm-engine";
import { TAlarmProviderRegistry } from "./alarm-provider-registry";

type TAlarmQueueServiceFactoryDep = {
  cronJob: TCronJobFactory;
  queueService: TQueueServiceFactory;
  alarmDAL: Pick<TAlarmDALFactory, "findEnabledByResourceType" | "findById">;
  alarmProviderRegistry: TAlarmProviderRegistry;
  alarmEngine: Pick<TAlarmEngine, "runAlarm">;
};

export type TAlarmQueueServiceFactory = ReturnType<typeof alarmQueueServiceFactory>;

const ALARM_DISPATCH_CONCURRENCY = 5;

export const alarmQueueServiceFactory = ({
  cronJob,
  queueService,
  alarmDAL,
  alarmProviderRegistry,
  alarmEngine
}: TAlarmQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const enqueueDueAlarms = async () => {
    for (const resourceType of alarmProviderRegistry.resourceTypes()) {
      // eslint-disable-next-line no-await-in-loop
      const alarms = await alarmDAL.findEnabledByResourceType(resourceType);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        alarms.map((alarm) =>
          queueService.queue(
            QueueName.AlarmDispatch,
            QueueJobs.AlarmDispatch,
            { alarmId: alarm.id },
            {
              jobId: `alarm-dispatch-${alarm.id}`,
              removeOnComplete: true,
              removeOnFail: { count: 5 },
              attempts: 3,
              backoff: { type: "exponential", delay: 5000 }
            }
          )
        )
      );
    }
  };

  const init = () => {
    queueService.start(
      QueueName.AlarmDispatch,
      async (job) => {
        const { alarmId } = job.data;
        const alarm = await alarmDAL.findById(alarmId);
        if (!alarm || !alarm.enabled) return;
        await alarmEngine.runAlarm(alarm);
      },
      { concurrency: ALARM_DISPATCH_CONCURRENCY }
    );

    cronJob.register({
      name: CronJobName.DailyAlarmProcessing,
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60 * 24,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        logger.info("cron[daily-alarm-processing]: enqueueing due alarms");
        await enqueueDueAlarms();
        logger.info("cron[daily-alarm-processing]: enqueue complete");
      }
    });
  };

  return { init, enqueueDueAlarms };
};
