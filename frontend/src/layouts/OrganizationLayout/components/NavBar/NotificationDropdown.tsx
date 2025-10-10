import { useMemo } from "react";
import { faBell } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "@tanstack/react-router";

import {
  ContentLoader,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@app/components/v2";
import {
  useDeleteNotification,
  useMarkAllNotificationsAsRead,
  useUpdateNotification
} from "@app/hooks/api/notifications/mutations";
import { useGetMyNotifications } from "@app/hooks/api/notifications/queries";

import { Notification } from "./Notification";

export const NotificationDropdown = () => {
  const router = useRouter();

  const { data: notifications, isLoading } = useGetMyNotifications();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: updateNotification } = useUpdateNotification();
  const { mutate: deleteNotification } = useDeleteNotification();

  const unreadCount = useMemo(
    () => notifications?.filter((n) => !n.isRead).length || 0,
    [notifications]
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger>
        <div className="border-mineshaft-500 hover:bg-mineshaft-600 relative border border-r-0 px-2.5 py-1">
          <FontAwesomeIcon icon={faBell} className="text-mineshaft-200" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-yellow-400 px-1 text-[10px] text-black">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="z-999 mt-3 flex h-[550px] w-[400px] overflow-hidden rounded-lg"
      >
        <div className="flex w-full flex-col">
          <div className="border-mineshaft-500 flex items-center justify-between border-b px-3 py-2">
            <span className="font-medium text-white">Notifications</span>
            <button
              type="button"
              className="text-mineshaft-300 hover:text-primary-400 text-xs font-medium disabled:pointer-events-none disabled:opacity-50"
              onClick={(e) => {
                e.preventDefault();
                markAllAsRead();
              }}
              disabled={unreadCount === 0}
            >
              Mark all as read
            </button>
          </div>
          <div className="flex h-full w-full overflow-auto">
            {isLoading && (
              <div className="flex h-full w-full items-center justify-center">
                <ContentLoader className="pointer-events-none" lottieClassName="size-10" />
              </div>
            )}
            {!isLoading && notifications?.length === 0 && (
              <div className="flex h-full w-full flex-col items-center justify-center">
                <FontAwesomeIcon icon={faBell} size="3x" className="text-mineshaft-400" />
                <span className="text-mineshaft-300 mt-4 text-sm">No new notifications</span>
                <span className="text-mineshaft-400 text-xs">
                  We&apos;ll let you know when something important happens.
                </span>
              </div>
            )}
            {!isLoading && notifications && notifications.length > 0 && (
              <div className="flex w-full flex-col">
                {notifications.map((notification) => (
                  <div
                    role="button"
                    tabIndex={0}
                    key={notification.id}
                    onClick={() => {
                      if (!notification.isRead) {
                        updateNotification({ notificationId: notification.id, isRead: true });
                      }
                      if (notification.link) {
                        router.navigate({ to: notification.link });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      if (!notification.isRead) {
                        updateNotification({ notificationId: notification.id, isRead: true });
                      }
                      if (notification.link) {
                        router.navigate({ to: notification.link });
                      }
                    }}
                  >
                    <Notification notification={notification} onDelete={deleteNotification} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
