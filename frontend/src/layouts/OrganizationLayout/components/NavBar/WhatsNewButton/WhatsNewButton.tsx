import { useCallback, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";

import { IconButton, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { useUser } from "@app/context";
import { useGetChangelogFeed } from "@app/hooks/api/changelog";

import { ChangelogDialog } from "./ChangelogDialog";

const CHANGELOG_LAST_VIEWED_KEY = "infisical_changelog_last_viewed";

const getLastViewedTimestamp = (userId: string): number => {
  try {
    const stored = localStorage.getItem(`${CHANGELOG_LAST_VIEWED_KEY}_${userId}`);
    return stored ? Number(stored) : 0;
  } catch {
    return 0;
  }
};

const setLastViewedTimestamp = (userId: string) => {
  try {
    localStorage.setItem(`${CHANGELOG_LAST_VIEWED_KEY}_${userId}`, String(Date.now()));
  } catch {
    // localStorage may be unavailable
  }
};

export const WhatsNewButton = () => {
  const { user } = useUser();
  const { data: feed, isLoading } = useGetChangelogFeed();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const items = feed?.items ?? [];

  const unreadCount = useMemo(() => {
    if (!items.length) return 0;

    const lastViewed = getLastViewedTimestamp(user.id);
    if (lastViewed === 0) return items.length > 0 ? 1 : 0;

    return items.filter((item) => new Date(item.publishedAt).getTime() > lastViewed).length;
  }, [items, user.id]);

  const handleOpenDialog = useCallback(() => {
    setIsDialogOpen(true);
    setLastViewedTimestamp(user.id);
  }, [user.id]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            variant="outline"
            size="sm"
            aria-label="What's New"
            className="relative"
            onClick={handleOpenDialog}
          >
            <Sparkles />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          What&apos;s New{unreadCount > 0 ? ` (${unreadCount} new)` : ""}
        </TooltipContent>
      </Tooltip>
      <ChangelogDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        items={items}
        isLoading={isLoading}
      />
    </>
  );
};
