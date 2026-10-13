import Markdown from "react-markdown";
import { formatDistance } from "date-fns";
import { Trash2 } from "lucide-react";
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
              <span
                className={twMerge(
                  "size-2 shrink-0 rounded-full",
                  isCritical ? "bg-danger" : "bg-warning"
                )}
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
          <div className="relative ml-auto shrink-0 pl-7">
            <span className="inline-block text-xs leading-5 whitespace-nowrap text-muted transition-transform group-focus-within:-translate-x-7 group-hover:-translate-x-7 [@media(hover:none)]:-translate-x-7">
              {formatDistance(notification.createdAt, new Date())} ago
            </span>
            <IconButton
              aria-label="Delete notification"
              variant="ghost-muted"
              size="2xs"
              className="absolute -top-0.5 right-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(notification.id);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <Trash2 />
            </IconButton>
          </div>
        </div>
        {notification.body && (
          <div className="w-full overflow-hidden text-xs break-words text-accent">
            <Markdown>{notification.body}</Markdown>
          </div>
        )}
      </div>
    </div>
  );
};
