import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { TUserNotification } from "./types";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (orgId: string) => [...notificationKeys.all, "list", { orgId }] as const
};

export const useGetMyNotifications = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id || "";

  return useQuery({
    queryKey: notificationKeys.list(orgId),
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
