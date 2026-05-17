import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton
} from "@app/components/v3";
import { TAnnouncement } from "@app/hooks/api/announcement";

type Props = {
  announcements: TAnnouncement[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric"
});

const formatPublished = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : dateFormatter.format(date);
};

// Belt to the server-side allowlist: refuse anything that isn't an http(s) URL
// so a stale self-hosted bundle can't sneak a `javascript:` href into <a>.
const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:"]);
const safeLink = (link: string | null): string | null => {
  if (!link) return null;
  try {
    const { protocol } = new URL(link, window.location.origin);
    return ALLOWED_LINK_PROTOCOLS.has(protocol) ? link : null;
  } catch {
    return null;
  }
};

export const AnnouncementModal = ({ announcements, isOpen, onOpenChange }: Props) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setIndex(0);
  }, [isOpen]);

  const total = announcements.length;
  const safeIndex = Math.min(index, total - 1);
  const announcement = announcements[safeIndex];
  if (!announcement) return null;

  const safeHref = safeLink(announcement.link);
  const ctaLabel = announcement.linkLabel || (safeHref ? "Learn more" : null);
  const publishedLabel = formatPublished(announcement.published);
  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < total - 1;
  const showPager = total > 1;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        {announcement.imageUrl && (
          <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              src={announcement.imageUrl}
              alt=""
              loading="eager"
              className="h-full w-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col gap-4 p-4">
          <DialogHeader>
            {publishedLabel && (
              <time
                dateTime={announcement.published}
                className="text-xs font-medium tracking-wide text-muted uppercase"
              >
                {publishedLabel}
              </time>
            )}
            <DialogTitle>{announcement.title}</DialogTitle>
            <DialogDescription className="my-4 whitespace-pre-line text-foreground/75">
              {announcement.body}
            </DialogDescription>
            {safeHref && ctaLabel && (
              <a
                href={safeHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-sm text-white underline"
              >
                {ctaLabel}
                <ExternalLink className="size-3.5" />
              </a>
            )}
          </DialogHeader>
          <div className="flex items-center justify-between gap-2">
            {showPager ? (
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Previous announcement"
                  onClick={() => setIndex(Math.max(0, safeIndex - 1))}
                  isDisabled={!hasPrev}
                >
                  <ChevronLeft />
                </IconButton>
                <span className="tabular-nums">
                  {safeIndex + 1} / {total}
                </span>
                <IconButton
                  variant="ghost"
                  size="xs"
                  aria-label="Next announcement"
                  onClick={() => setIndex(Math.min(total - 1, safeIndex + 1))}
                  isDisabled={!hasNext}
                >
                  <ChevronRight />
                </IconButton>
              </div>
            ) : (
              <span aria-hidden="true" />
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Got it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
