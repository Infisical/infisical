import Notification, { TNotification } from "./Notification";

interface NoticationsProps {
  notifications: Required<TNotification>[];
  clearNotification: (text: string) => void;
}

const Notifications = ({ notifications, clearNotification }: NoticationsProps) => {
  if (!notifications.length) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-2 bottom-2 z-50 hidden h-full w-96 gap-y-2 md:flex md:flex-col-reverse">
      {notifications.map((notif) => (
        <Notification key={notif.text} notification={notif} clearNotification={clearNotification} />
      ))}
    </div>
  );
};

export default Notifications;
