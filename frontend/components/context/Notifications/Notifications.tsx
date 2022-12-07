import Notification from "./Notification";
import { Notification as NotificationType } from "./NotificationProvider";

interface NoticationsProps {
  notifications: NotificationType[];
  clearNotification: (text?: string) => void;
}

const Notifications = ({
  notifications,
  clearNotification,
}: NoticationsProps) => {
  return (
    <div className="hidden fixed z-50 top-1 w-full inset-x-0 pointer-events-none md:flex justify-center">
      <div className="flex flex-col gap-y-2 w-96">
        {notifications.map((notif) => (
          <Notification
            key={notif.text}
            notification={notif}
            clearNotification={clearNotification}
          />
        ))}
      </div>
    </div>
  );
};

export default Notifications;
