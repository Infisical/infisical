import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { TNotification } from "./Notification";
import Notifications from "./Notifications";

type NotificationContextState = {
  createNotification: (newNotification: TNotification) => void;
};

const NotificationContext = createContext<NotificationContextState>({
  createNotification: () => console.log("createNotification not set!")
});

export const useNotificationContext = () => useContext(NotificationContext);

interface NotificationProviderProps {
  children: ReactNode;
}

// TODO: Migration to radix toast
const NotificationProvider = ({ children }: NotificationProviderProps) => {
  const [notifications, setNotifications] = useState<Required<TNotification>[]>([]);

  const clearNotification = (text: string) =>
    setNotifications((state) => state.filter((notif) => notif.text !== text));

  const createNotification = useCallback(
    ({ text, type = "success", timeoutMs = 4000 }: TNotification) => {
      const doesNotifExist = notifications.some((notif) => notif.text === text);

      if (doesNotifExist) {
        return;
      }

      const newNotification: Required<TNotification> = { text, type, timeoutMs };

      setNotifications((state) => [...state, newNotification]);
    },
    [notifications]
  );

  const value = useMemo(() => ({ createNotification }), [createNotification]);

  return (
    <NotificationContext.Provider value={value}>
      <Notifications notifications={notifications} clearNotification={clearNotification} />
      {children}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;
