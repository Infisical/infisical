import { useEffect, useRef } from 'react';
import { faX } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

type NotificationType = 'success' | 'error' | 'info';

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
      className="relative w-full flex items-center justify-between px-4 py-4 rounded-md border border-bunker-500 pointer-events-auto bg-bunker-500"
      role="alert"
    >
      {notification.type === 'error' && (
        <div className="absolute w-full h-1 bg-red top-0 left-0 rounded-t-md" />
      )}
      {notification.type === 'success' && (
        <div className="absolute w-full h-1 bg-green top-0 left-0 rounded-t-md" />
      )}
      {notification.type === 'info' && (
        <div className="absolute w-full h-1 bg-yellow top-0 left-0 rounded-t-md" />
      )}
      <p className="text-bunker-200 text-sm font-semibold mt-0.5">{notification.text}</p>
      <button
        type="button"
        className="rounded-lg"
        onClick={() => clearNotification(notification.text)}
      >
        <FontAwesomeIcon className="text-white pl-2 w-4 h-3 hover:text-red" icon={faX} />
      </button>
    </div>
  );
};

export default Notification;
