import Notification from './Notification';
import { Notification as NotificationType } from './NotificationProvider';

interface NoticationsProps {
  notifications: Required<NotificationType>[];
  clearNotification: (text: string) => void;
}

const Notifications = ({
  notifications,
  clearNotification
}: NoticationsProps) => {
  if (!notifications.length) {
    return null;
  }

  return (
    <div className="hidden fixed z-50 md:flex md:flex-col-reverse bottom-1 gap-y-2 w-96 h-full right-2 bottom-2 pointer-events-none">
      {notifications.map((notif) => (
        <Notification
          key={notif.text}
          notification={notif}
          clearNotification={clearNotification}
        />
      ))}
    </div>
  );
};

export default Notifications;
