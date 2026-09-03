import Markdown from "react-markdown";
import { faCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip } from "@app/components/v2";
import { isCriticalNotification, TUserNotification } from "@app/hooks/api/notifications/types";

type Props = {
  notification: TUserNotification;
  onDelete: (notificationId: string) => void;
};

export const Notification = ({ notification, onDelete }: Props) => {
  const isCritical = isCriticalNotification(notification.type);

  return (
    <div
      className={twMerge(
        "group relative flex cursor-pointer items-start border-b border-border p-2 transition-colors",
        notification.link ? "hover:bg-container-hover" : "cursor-default",
        !notification.isRead && "bg-container",
        isCritical && !notification.isRead && "border-l-2 border-l-danger"
      )}
    >
      <div className="flex w-full min-w-0 flex-col p-1">
        <div className="flex items-start gap-2">
          {!notification.isRead && (
            <div className="flex h-5 items-center">
              <FontAwesomeIcon
                icon={faCircle}
                className={twMerge("size-2 shrink-0", isCritical ? "text-danger" : "text-warning")}
              />
            </div>
          )}
          <Tooltip
            content={<Markdown>{notification.title}</Markdown>}
            delayDuration={300}
            className="z-1000"
          >
            <span className="overflow-hidden text-sm leading-5 font-medium text-ellipsis whitespace-nowrap text-foreground">
              <Markdown components={{ p: "span" }}>{notification.title}</Markdown>
            </span>
          </Tooltip>
          <span className="mt-px ml-auto text-xs whitespace-nowrap text-muted">
            {formatDistance(notification.createdAt, new Date())} ago
          </span>
        </div>
        {notification.body && (
          <div className="w-full overflow-hidden text-xs break-words text-label">
            <Markdown>{notification.body}</Markdown>
          </div>
        )}
      </div>
      <div className="mt-0.5 flex w-0 shrink-0 justify-end opacity-0 transition-all group-hover:w-[24px] group-hover:opacity-100">
        <IconButton
          ariaLabel="delete"
          variant="plain"
          colorSchema="danger"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(notification.id);
          }}
        >
          <FontAwesomeIcon icon={faTrash} />
        </IconButton>
      </div>
    </div>
  );
};
