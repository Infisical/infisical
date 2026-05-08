import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { announcementKeys } from "./queries";
import { TRecentAnnouncementsResponse } from "./types";

export const useMarkAnnouncementSeen = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { data } = await apiRequest.post<{ lastSeenAnnouncementId: string | null }>(
        "/api/v1/announcement/seen",
        { announcementId }
      );
      return data.lastSeenAnnouncementId;
    },
    onSuccess: (lastSeenAnnouncementId) => {
      queryClient.setQueryData<TRecentAnnouncementsResponse>(announcementKeys.recent(), (prev) =>
        prev ? { ...prev, lastSeenAnnouncementId } : prev
      );
    }
  });
};
