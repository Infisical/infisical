import { createContext, ReactNode, useContext, useState } from "react";

import Notifications from "./Notifications";

type NotificationType = "success" | "error";

export type Notification = {
  text: string;
  type: NotificationType;
  timeoutMs?: number;
};

type NotificationContextState = {
  createNotification: ({ text, type }: Notification) => void;
};

const NotificationContext = createContext<NotificationContextState>({
  createNotification: () => console.log("createNotification not set!"),
});

export const useNotificationContext = () => useContext(NotificationContext);

interface NotificationProviderProps {
  children: ReactNode;
}

const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const clearNotification = (text?: string) => {
    if (text) {
      return setNotifications((state) =>
        state.filter((notif) => notif.text !== text)
      );
    }

    return setNotifications([]);
  };

  const createNotification = ({
    text,
    type = "success",
    timeoutMs = 2000,
  }: Notification) => {
    const doesNotifExist = notifications.some((notif) => notif.text === text);

    if (doesNotifExist) {
      return;
    }

    const newNotification: Notification = { text, type, timeoutMs };

    return setNotifications((state) => [...state, newNotification]);
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
