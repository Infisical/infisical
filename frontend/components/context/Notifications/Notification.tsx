import { faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classnames from "classnames";

import { Notification as NotificationType } from "./NotificationProvider";

interface NotificationProps {
  notification: NotificationType;
  clearNotification: (text: string) => void;
}

const Notification = ({
  notification,
  clearNotification,
}: NotificationProps) => {
  return (
    <div
      className={classnames(
        "w-full flex items-center justify-between px-4 py-3 rounded pointer-events-auto",
        {
          "bg-green-600": notification.type === "success",
          "bg-red-500": notification.type === "error",
        }
      )}
      role="alert"
    >
      <p className="text-white text-sm font-bold">{notification.text}</p>
      <button
        className="bg-white/5 rounded-lg p-3"
        onClick={() => clearNotification(notification.text)}
      >
        <FontAwesomeIcon className="text-white" icon={faXmarkCircle} />
      </button>
    </div>
  );
};

export default Notification;
