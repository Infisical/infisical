import Markdown from "react-markdown";
import { faCircle, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { IconButton, Tooltip } from "@app/components/v2";
import { TUserNotification } from "@app/hooks/api/notifications/types";

type Props = {
  notification: TUserNotification;
  onDelete: (notificationId: string) => void;
};

export const Notification = ({ notification, onDelete }: Props) => {
  return (
    <div
      className={twMerge(
        "group relative flex cursor-pointer items-start border-b border-mineshaft-600 p-3 transition-colors",
        notification.link ? "hover:bg-mineshaft-700" : "cursor-default",
        !notification.isRead && "bg-mineshaft-800"
      )}
    >
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex gap-2">
          {!notification.isRead && (
            <FontAwesomeIcon icon={faCircle} className="mt-1.5 size-2 text-yellow-400" />
          )}
          <Tooltip content={<Markdown>{notification.title}</Markdown>} delayDuration={300}>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-5 text-mineshaft-100">
              <Markdown components={{ p: "span" }}>{notification.title}</Markdown>
            </span>
          </Tooltip>
          <span className="ml-auto mt-px whitespace-nowrap text-xs text-mineshaft-400">
            {formatDistance(notification.createdAt, new Date())} ago
          </span>
        </div>
        {notification.body && (
          <span className="max-w-[350px] text-xs text-mineshaft-300">
            <Markdown>{notification.body}</Markdown>
          </span>
        )}
      </div>
      <div className="flex w-0 flex-shrink-0 justify-end opacity-0 transition-all group-hover:w-[24px] group-hover:opacity-100">
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
