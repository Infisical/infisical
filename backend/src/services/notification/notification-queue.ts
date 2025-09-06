import { QueueJobs, TQueueServiceFactory } from "@app/queue";

import { TCreateUserNotificationDTO } from "./notification-types";
import { TUserNotificationDALFactory } from "./user-notification-dal";

type TNotificationQueueServiceFactoryDep = {
  userNotificationDAL: Pick<TUserNotificationDALFactory, "create">;
  queueService: TQueueServiceFactory;
};

export type TNotificationQueueServiceFactory = {
  pushUserNotification: (data: TCreateUserNotificationDTO) => Promise<void>;
};

export const notificationQueueServiceFactory = async ({
  userNotificationDAL,
  queueService
}: TNotificationQueueServiceFactoryDep): Promise<TNotificationQueueServiceFactory> => {
  const pushUserNotification = async (data: TCreateUserNotificationDTO) => {
    await queueService.queuePg(QueueJobs.UserNotification, data);
  };

  await queueService.startPg(
    QueueJobs.UserNotification,
    async ([job]) => {
      const { userId, type, title, body, link } = job.data as TCreateUserNotificationDTO;

      await userNotificationDAL.create({
        userId,
        type,
        title,
        body,
        link
      });
    },
    {
      batchSize: 100,
      workerCount: 5,
      pollingIntervalSeconds: 2
    }
  );

  return {
    pushUserNotification
  };
};
