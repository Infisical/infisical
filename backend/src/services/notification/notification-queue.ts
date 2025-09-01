import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

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
    await queueService.queue<QueueName.UserNotification>(QueueName.UserNotification, QueueJobs.UserNotification, data, {
      removeOnFail: {
        count: 3
      },
      removeOnComplete: true
    });
  };

  queueService.start(QueueName.UserNotification, async (job) => {
    const { userId, type, title, body, link } = job.data;

    await userNotificationDAL.create({
      userId,
      type,
      title,
      body,
      link
    });
  });

  return {
    pushUserNotification
  };
};
