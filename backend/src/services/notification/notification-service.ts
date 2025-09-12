import { NotFoundError, UnauthorizedError } from "@app/lib/errors";

import { TNotificationQueueServiceFactory } from "./notification-queue";
import { TCreateUserNotificationDTO } from "./notification-types";
import { TUserNotificationDALFactory } from "./user-notification-dal";

type TNotificationServiceFactoryDep = {
  notificationQueue: TNotificationQueueServiceFactory;
  userNotificationDAL: TUserNotificationDALFactory;
};

export type TNotificationServiceFactory = ReturnType<typeof notificationServiceFactory>;

export const notificationServiceFactory = ({
  notificationQueue,
  userNotificationDAL
}: TNotificationServiceFactoryDep) => {
  const listUserNotifications = async ({ userId, orgId }: { userId: string; orgId: string }) => {
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const notifications = await userNotificationDAL.find({
      userId,
      orgId,
      startDate: threeMonthsAgo.toISOString(),
      endDate: now.toISOString()
    });

    return notifications;
  };

  const createUserNotifications = async (data: TCreateUserNotificationDTO[]) => {
    return notificationQueue.pushUserNotifications(data);
  };

  const deleteUserNotification = async ({ userId, notificationId }: { userId: string; notificationId: string }) => {
    if (!userId) throw new UnauthorizedError({ message: "Invalid userId" });

    const deletedNotifications = await userNotificationDAL.delete({ id: notificationId, userId });

    if (deletedNotifications.length <= 0) throw new NotFoundError({ message: "Notification not found" });

    return deletedNotifications[0];
  };

  const markUserNotificationsAsRead = async ({ userId, orgId }: { userId: string; orgId: string }) => {
    await userNotificationDAL.markAllNotificationsAsRead(userId, orgId);
  };

  const updateUserNotification = async ({
    userId,
    notificationId,
    isRead
  }: {
    userId: string;
    notificationId: string;
    isRead: boolean;
  }) => {
    const [updatedNotification] = await userNotificationDAL.update(
      {
        id: notificationId,
        userId
      },
      {
        isRead
      }
    );

    if (!updatedNotification) throw new NotFoundError({ message: "Notification not found" });
    return updatedNotification;
  };

  return {
    listUserNotifications,
    createUserNotifications,
    deleteUserNotification,
    markUserNotificationsAsRead,
    updateUserNotification
  };
};
