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
    <div className="hidden fixed z-50 md:flex md:flex-col-reverse gap-y-2 w-96 h-full right-2 bottom-2 pointer-events-none">
      {notifications.map((notif) => (
        <Notification key={notif.text} notification={notif} clearNotification={clearNotification} />
      ))}
    </div>
  );
};

export default Notifications;
