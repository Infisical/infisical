import { createContext, ReactNode, useContext, useState } from "react";
import { faXmarkCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import classnames from "classnames";

type NotificationType = "success" | "error";
type Notification = {
  text: string;
  type: NotificationType;
};

type NotificationContextState = {
  createNotification: (text: string, type?: NotificationType) => void;
};
const NotificationContext = createContext<NotificationContextState>({
  createNotification: () => console.log("createNotification not set!"),
});

export const useNotificationContext = () => useContext(NotificationContext);

interface NotificationProviderProps {
  children: ReactNode;
}

interface NoticationsProps {
  notifications: Notification[];
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
          <div
            key={notif.text}
            className={classnames(
              "w-full flex items-center justify-between px-4 py-3 rounded pointer-events-auto",
              {
                "bg-green-500": notif.type === "success",
                "bg-red-500": notif.type === "error",
              }
            )}
            role="alert"
          >
            <p className="text-white text-sm font-bold">{notif.text}</p>
            <button
              className="bg-white/5 rounded-lg p-3"
              onClick={() => clearNotification(notif.text)}
            >
              <FontAwesomeIcon className="text-white" icon={faXmarkCircle} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      text: "Your secrets weren't saved, please fix the conflicts first.",
      type: "error",
    },
    {
      text: "Testing",
      type: "success",
    },
  ]);

  const clearNotification = (text?: string) => {
    if (text) {
      return setNotifications((state) =>
        state.filter((notif) => notif.text !== text)
      );
    }

    return setNotifications([]);
  };

  const createNotification = (
    text: string,
    type: NotificationType = "success"
  ) => {
    const doesNotifExist = notifications.some((notif) => notif.text === text);

    if (doesNotifExist) {
      return;
    }

    return setNotifications((state) => [...state, { text, type }]);
  };

  return (
    <NotificationContext.Provider
      value={{
        createNotification,
      }}
    >
      <Notifications
        notifications={notifications}
        clearNotification={clearNotification}
      />
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
