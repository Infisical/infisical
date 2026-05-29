import { useCallback } from "react";

import { useGetRecentAnnouncements, useMarkAnnouncementSeen } from "@app/hooks/api/announcement";

export const useAnnouncementSeen = () => {
  const { data } = useGetRecentAnnouncements();
  const { mutate: markSeenMutation } = useMarkAnnouncementSeen();

  const seenId = data?.lastSeenAnnouncementId ?? null;

  const markSeen = useCallback(
    (id: string) => {
      if (id === seenId) return;
      markSeenMutation(id);
    },
    [seenId, markSeenMutation]
  );

  const hasUnseen = useCallback(
    (id: string | null | undefined) => Boolean(id && id !== seenId),
    [seenId]
  );

  return { seenId, markSeen, hasUnseen };
};
