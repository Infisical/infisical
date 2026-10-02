import Markdown from "react-markdown";
import { faCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
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
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <span className="overflow-hidden text-sm leading-5 font-medium text-ellipsis whitespace-nowrap text-foreground">
                <Markdown components={{ p: "span" }}>{notification.title}</Markdown>
              </span>
            </TooltipTrigger>
            <TooltipContent className="z-[var(--z-index-tooltip)]">
              <Markdown>{notification.title}</Markdown>
            </TooltipContent>
          </Tooltip>
          <span className="mt-px ml-auto text-xs whitespace-nowrap text-muted">
            {formatDistance(notification.createdAt, new Date())} ago
          </span>
        </div>
        {notification.body && (
          <div className="w-full overflow-hidden text-xs break-words text-accent">
            <Markdown>{notification.body}</Markdown>
          </div>
        )}
      </div>
      <div className="mt-0.5 flex w-0 shrink-0 justify-end opacity-0 transition-all group-hover:w-[24px] group-hover:opacity-100">
        <IconButton
          aria-label="Delete notification"
          variant="danger"
          size="xs"
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
