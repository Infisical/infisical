import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserNotification } from "./types";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const
};

export const useGetMyNotifications = () => {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: async () => {
      const {
        data: { notifications }
      } = await apiRequest.get<{ notifications: TUserNotification[] }>(
        "/api/v1/notifications/user"
      );
      return notifications;
    },
    refetchInterval: 30 * 1000 // Poll every 30 seconds
  });
};
