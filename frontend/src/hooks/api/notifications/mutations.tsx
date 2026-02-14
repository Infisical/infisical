import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";

import { notificationKeys } from "./queries";
import { TUserNotification } from "./types";

export const useMarkAllNotificationsAsRead = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id || "";

  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest.post("/api/v1/notifications/user/mark-as-read", {});
    },
    onSuccess: () => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(orgId), (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((notification) => ({
          ...notification,
          isRead: true
        }));
      });
    }
  });
};

export const useUpdateNotification = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id || "";

  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ notificationId, isRead }: { notificationId: string; isRead: boolean }) => {
      const { data } = await apiRequest.patch<{ notification: TUserNotification }>(
        `/api/v1/notifications/user/${notificationId}`,
        { isRead }
      );
      return data.notification;
    },
    onSuccess: (updatedNotification) => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(orgId), (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((notification) =>
          notification.id === updatedNotification.id ? updatedNotification : notification
        );
      });
    }
  });
};

export const useDeleteNotification = () => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg.id || "";

  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest.delete(`/api/v1/notifications/user/${notificationId}`);
    },
    onSuccess: (_, notificationId) => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(orgId), (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((notification) => notification.id !== notificationId);
      });
    }
  });
};
