import { QueueJobs, TQueueServiceFactory } from "@app/queue";

import { TCreateUserNotificationDTO } from "./notification-types";
import { TUserNotificationDALFactory } from "./user-notification-dal";

type TNotificationQueueServiceFactoryDep = {
  userNotificationDAL: Pick<TUserNotificationDALFactory, "batchInsert">;
  queueService: TQueueServiceFactory;
};

export type TNotificationQueueServiceFactory = {
  pushUserNotifications: (data: TCreateUserNotificationDTO[]) => Promise<void>;
  init: () => Promise<void>;
};

export const notificationQueueServiceFactory = async ({
  userNotificationDAL,
  queueService
}: TNotificationQueueServiceFactoryDep): Promise<TNotificationQueueServiceFactory> => {
  const pushUserNotifications = async (data: TCreateUserNotificationDTO[]) => {
    await queueService.queuePg(QueueJobs.UserNotification, { notifications: data });
  };

  const init = async () => {
    await queueService.startPg(
      QueueJobs.UserNotification,
      async ([job]) => {
        const { notifications } = job.data as { notifications: TCreateUserNotificationDTO[] };
        await userNotificationDAL.batchInsert(notifications);
      },
      {
        batchSize: 1,
        workerCount: 2,
        pollingIntervalSeconds: 1
      }
    );
  };

  return {
    pushUserNotifications,
    init
  };
};
