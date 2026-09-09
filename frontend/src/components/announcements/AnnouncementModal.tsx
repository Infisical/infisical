import { KeyboardEvent, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, XIcon } from "lucide-react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const safeLink = (link: string | null): string | null => {
  if (!link) return null;
  try {
    const { protocol } = new URL(link, window.location.origin);
    return ALLOWED_LINK_PROTOCOLS.has(protocol) ? link : null;
  } catch {
    return null;
  }
};

const AnnouncementImage = ({ src }: { src: string }) => {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-container">
      {status !== "loaded" && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center text-sm text-muted"
        >
          {status === "error" ? "Image unavailable" : "Loading image…"}
        </div>
      )}
      <img
        src={src}
        alt=""
        loading="eager"
        onLoad={() => setStatus("loaded")}
        onError={() => setStatus("error")}
        className={
          status === "loaded"
            ? "absolute inset-0 h-full w-full object-cover"
            : "invisible absolute inset-0 h-full w-full object-cover"
        }
      />
    </div>
  );
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

  const showPrev = () => setIndex(Math.max(0, safeIndex - 1));
  const showNext = () => setIndex(Math.min(total - 1, safeIndex + 1));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if ((event.target as HTMLElement | null)?.closest(TEXT_ENTRY_SELECTOR)) return;

    if (event.key === "ArrowLeft" && hasPrev) {
      event.preventDefault();
      showPrev();
    } else if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      showNext();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="h-[40rem] max-w-xl gap-0 overflow-hidden p-0"
        onKeyDown={handleKeyDown}
      >
        <DialogClose asChild>
          <IconButton
            aria-label="Close"
            variant="outline"
            size="xs"
            className="absolute top-3 right-3 z-20 bg-popover hover:bg-container-hover"
          >
            <XIcon />
          </IconButton>
        </DialogClose>
        <DialogBody key={announcement.id} className="overscroll-contain">
          {announcement.imageUrl && (
            <AnnouncementImage key={announcement.imageUrl} src={announcement.imageUrl} />
          )}
          <div className={announcement.imageUrl ? "p-4" : "p-4 pr-14"}>
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
          </div>
        </DialogBody>
        <DialogFooter className="mx-0 justify-between">
          {showPager ? (
            <div className="flex items-center gap-1.5 text-sm text-muted">
              <IconButton
                variant="ghost"
                size="xs"
                aria-label="Previous announcement"
                onClick={showPrev}
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
                onClick={showNext}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
