import { useEffect, useRef } from "react";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type NotificationType = "success" | "error" | "info";

export type TNotification = {
  text: string;
  type?: NotificationType;
  timeoutMs?: number;
};

interface NotificationProps {
  notification: Required<TNotification>;
  clearNotification: (text: string) => void;
}

const Notification = ({ notification, clearNotification }: NotificationProps) => {
  const timeout = useRef<number>();

  const handleClearNotification = () => clearNotification(notification.text);

  const setNotifTimeout = () => {
    timeout.current = window.setTimeout(handleClearNotification, notification.timeoutMs);
  };

  const cancelNotifTimeout = () => {
    clearTimeout(timeout.current);
  };

  useEffect(() => {
    setNotifTimeout();

    return cancelNotifTimeout;
  }, []);

  return (
    <div
      className="pointer-events-auto relative right-3 mb-3 flex w-full items-center justify-between rounded-md border border-bunker-500 bg-mineshaft-700 px-6 py-4"
      role="alert"
    >
      {notification.type === "error" && (
        <div className="absolute top-0 left-0 h-1 w-full rounded-t-md bg-red" />
      )}
      {notification.type === "success" && (
        <div className="absolute top-0 left-0 h-1 w-full rounded-t-md bg-green" />
      )}
      {notification.type === "info" && (
        <div className="absolute top-0 left-0 h-1 w-full rounded-t-md bg-yellow" />
      )}
      <p className="text-md font-base mt-0.5 text-bunker-200">{notification.text}</p>
      <button
        type="button"
        className="rounded-lg"
        onClick={() => clearNotification(notification.text)}
      >
        <FontAwesomeIcon
          className="absolute right-2 top-3 h-4 w-4 pl-2 text-bunker-300 hover:text-white"
          icon={faXmark}
        />
      </button>
    </div>
  );
};

export default Notification;
