import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TRecentAnnouncementsResponse } from "./types";

export const announcementKeys = {
  all: ["announcement"] as const,
  recent: () => [...announcementKeys.all, "recent"] as const
};

export const useGetRecentAnnouncements = () => {
  return useQuery({
    queryKey: announcementKeys.recent(),
    queryFn: async () => {
      const { data } = await apiRequest.get<TRecentAnnouncementsResponse>(
        "/api/v1/announcement/recent"
      );
      return data;
    },
    // Fetch once per session: a newly published announcement won't surface mid-session;
    // the user picks it up on the next hard reload or new tab.
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false
  });
};
