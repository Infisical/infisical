import { randomUUID } from "crypto";

import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TCreateUserNotificationDTO } from "./notification-types";
import { TUserNotificationDALFactory } from "./user-notification-dal";

type TNotificationQueueServiceFactoryDep = {
  userNotificationDAL: Pick<TUserNotificationDALFactory, "batchInsert">;
  queueService: TQueueServiceFactory;
};

export type TNotificationQueueServiceFactory = {
  pushUserNotifications: (data: TCreateUserNotificationDTO[]) => Promise<void>;
};

export const notificationQueueServiceFactory = ({
  userNotificationDAL,
  queueService
}: TNotificationQueueServiceFactoryDep): TNotificationQueueServiceFactory => {
  const pushUserNotifications = async (data: TCreateUserNotificationDTO[]) => {
    await queueService.queue(
      QueueName.UserNotification,
      QueueJobs.UserNotification,
      { notifications: data },
      { jobId: randomUUID() }
    );
  };

  queueService.start(QueueName.UserNotification, async (job) => {
    const { notifications } = job.data as { notifications: TCreateUserNotificationDTO[] };
    await userNotificationDAL.batchInsert(notifications);
  });

  return {
    pushUserNotifications
  };
};
