import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { notificationKeys } from "./queries";
import { TUserNotification } from "./types";

export const useMarkAllNotificationsAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiRequest.post("/api/v1/notifications/user/mark-as-read");
    },
    onSuccess: () => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(), (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((notification) => ({
          ...notification,
          isRead: true
        }));
      });
    }
  });
};

export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest.post(`/api/v1/notifications/user/${notificationId}/mark-as-read`);
    },
    onSuccess: (_, notificationId) => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(), (oldData) => {
        if (!oldData) return oldData;
        return oldData.map((notification) =>
          notification.id === notificationId ? { ...notification, isRead: true } : notification
        );
      });
    }
  });
};

export const useDeleteNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest.delete(`/api/v1/notifications/user/${notificationId}`);
    },
    onSuccess: (_, notificationId) => {
      queryClient.setQueryData<TUserNotification[]>(notificationKeys.list(), (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((notification) => notification.id !== notificationId);
      });
    }
  });
};
