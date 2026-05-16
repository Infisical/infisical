import { useState } from "react";
import { Megaphone } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useGetRecentAnnouncements } from "@app/hooks/api/announcement";

import { AnnouncementModal } from "./AnnouncementModal";
import { useAnnouncementSeen } from "./useAnnouncementSeen";

export const AnnouncementNavButton = () => {
  const { data } = useGetRecentAnnouncements();
  const announcements = data?.announcements;
  const { hasUnseen, markSeen } = useAnnouncementSeen();
  const [isOpen, setIsOpen] = useState(false);

  if (!announcements || announcements.length === 0) return null;

  const latest = announcements[0];
  const showUnreadDot = hasUnseen(latest.id);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) markSeen(latest.id);
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label="What's new"
            className="relative"
            onClick={() => setIsOpen(true)}
          >
            <Megaphone className={showUnreadDot ? "text-warning" : ""} />
            {showUnreadDot && (
              <span
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 z-10 size-2 rounded-full bg-warning ring-2 ring-background"
              />
            )}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">What&apos;s New</TooltipContent>
      </Tooltip>
      <AnnouncementModal
        announcements={announcements}
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
      />
    </>
  );
};
