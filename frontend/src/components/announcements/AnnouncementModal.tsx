import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, XIcon } from "lucide-react";

import gradientMesh from "@app/assets/gradients/gradient-mesh.png";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  IconButton
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
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

const AnnouncementCard = ({
  announcement,
  offset,
  onNavigate
}: {
  announcement: TAnnouncement;
  offset: number;
  onNavigate: (direction: number) => void;
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const isActive = offset === 0;
  const safeHref = safeLink(announcement.link);
  const imageSrc = announcement.imageUrl ?? gradientMesh;
  const ctaLabel = announcement.linkLabel || (safeHref ? "Learn more" : null);
  const publishedLabel = formatPublished(announcement.published);
  const Title = isActive ? DialogTitle : "h2";
  const Description = isActive ? DialogDescription : "p";
  const previewTransform = (distance: number) =>
    `translateX(${Math.sign(offset) * distance}px) scale(0.96) rotate(${Math.sign(offset)}deg)`;

  useEffect(() => {
    if (isActive && cardRef.current) cardRef.current.scrollTop = 0;
  }, [isActive]);

  useEffect(() => {
    setIsHighlighted(false);
  }, [offset]);

  return (
    <>
      <div
        data-announcement-card
        ref={(node) => {
          cardRef.current = node;
          node?.toggleAttribute("inert", !isActive);
        }}
        aria-hidden={!isActive}
        role="region"
        aria-label={announcement.title}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The scrollable card needs keyboard focus so its full content is reachable.
        tabIndex={isActive ? 0 : -1}
        className={cn(
          "absolute inset-0 thin-scrollbar overflow-x-hidden overflow-y-auto overscroll-none rounded-lg border border-border bg-popover shadow-lg transition-[transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
          isActive ? "pointer-events-auto" : "pointer-events-none select-none",
          Math.abs(offset) > 1 && "invisible"
        )}
        style={{
          zIndex: isActive ? 20 : 10 - Math.abs(offset),
          filter: !isActive && isHighlighted ? "brightness(1.1)" : "brightness(1)",
          transform: isActive
            ? "translateX(0) scale(1) rotate(0deg)"
            : previewTransform(isHighlighted ? 40 : 32)
        }}
      >
        <div
          className="transition-[filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{ filter: isActive ? "blur(0px)" : "blur(3px)" }}
        >
          <AnnouncementImage key={imageSrc} src={imageSrc} />
          <div className="flex flex-col gap-3 px-4 py-8 @lg/announcements:px-6">
            {publishedLabel && (
              <time dateTime={announcement.published} className="text-xs text-accent">
                {publishedLabel}
              </time>
            )}
            <Title className="text-lg leading-snug font-semibold wrap-anywhere">
              {announcement.title}
            </Title>
            <Description className="my-2 text-sm wrap-anywhere whitespace-pre-line text-accent">
              {announcement.body}
            </Description>
            {safeHref && ctaLabel && (
              <a
                href={safeHref}
                tabIndex={isActive ? undefined : -1}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1.5 text-sm text-foreground underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="wrap-anywhere">{ctaLabel}</span>
                <ExternalLink className="size-3.5 shrink-0" />
              </a>
            )}
          </div>
        </div>
      </div>
      {Math.abs(offset) === 1 && (
        <Button
          data-announcement-preview
          variant="ghost"
          aria-label={`Show ${offset < 0 ? "previous" : "next"} announcement: ${announcement.title}`}
          className="pointer-events-auto absolute inset-0 z-10 h-full w-full rounded-lg border-0 bg-transparent p-0 transition-none hover:bg-transparent active:scale-100"
          style={{ transform: previewTransform(40) }}
          onPointerEnter={(event) => {
            if (event.pointerType !== "touch") setIsHighlighted(true);
          }}
          onPointerLeave={() => setIsHighlighted(false)}
          onFocus={() => setIsHighlighted(true)}
          onBlur={() => setIsHighlighted(false)}
          onClick={(event) => {
            event.currentTarget
              .closest<HTMLElement>('[role="dialog"]')
              ?.focus({ preventScroll: true });
            onNavigate(Math.sign(offset));
          }}
        />
      )}
    </>
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

  const hasPrev = safeIndex > 0;
  const hasNext = safeIndex < total - 1;
  const showPager = total > 1;

  const navigate = (direction: number) => {
    setIndex((current) =>
      Math.max(0, Math.min(total - 1, Math.min(current, total - 1) + direction))
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if ((event.target as HTMLElement | null)?.closest(TEXT_ENTRY_SELECTOR)) return;

    if (event.key === "ArrowLeft" && hasPrev) {
      event.preventDefault();
      if (
        (event.target as HTMLElement).closest(
          "[data-announcement-card], [data-announcement-preview]"
        )
      ) {
        event.currentTarget.focus();
      }
      navigate(-1);
    } else if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      if (
        (event.target as HTMLElement).closest(
          "[data-announcement-card], [data-announcement-preview]"
        )
      ) {
        event.currentTarget.focus();
      }
      navigate(1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        height="fixed"
        className="@container/announcements pointer-events-none w-[calc(100%-1rem)] max-w-4xl gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none motion-reduce:animate-none"
        onKeyDown={handleKeyDown}
      >
        <div
          className={cn(
            "relative mx-auto h-full min-h-0 w-[calc(100%-7rem)] max-w-xl",
            !showPager && "w-full"
          )}
        >
          {announcements.slice(Math.max(0, safeIndex - 2), safeIndex + 3).map((item, itemIndex) => (
            <AnnouncementCard
              key={item.id}
              announcement={item}
              offset={Math.max(0, safeIndex - 2) + itemIndex - safeIndex}
              onNavigate={navigate}
            />
          ))}
          <DialogClose asChild>
            <IconButton
              aria-label="Close"
              variant="ghost"
              size="xs"
              className="pointer-events-auto absolute top-3 right-3 z-30 bg-popover/80 backdrop-blur-sm hover:bg-container-hover"
            >
              <XIcon />
            </IconButton>
          </DialogClose>
          {showPager && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 z-30 rounded-full border border-border bg-popover/80 px-2.5 py-1 text-xs text-accent tabular-nums backdrop-blur-sm"
            >
              {safeIndex + 1} / {total}
            </span>
          )}
          {showPager && (
            <>
              <IconButton
                variant="ghost"
                size="md"
                aria-label="Previous announcement"
                aria-disabled={!hasPrev}
                onClick={() => hasPrev && navigate(-1)}
                className="pointer-events-auto absolute top-1/2 -left-14 z-30 size-11 -translate-y-1/2 transition-[color,background-color,transform] aria-disabled:cursor-default aria-disabled:opacity-30 motion-reduce:transition-none [&>svg]:size-5"
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                variant="ghost"
                size="md"
                aria-label="Next announcement"
                aria-disabled={!hasNext}
                onClick={() => hasNext && navigate(1)}
                className="pointer-events-auto absolute top-1/2 -right-14 z-30 size-11 -translate-y-1/2 transition-[color,background-color,transform] aria-disabled:cursor-default aria-disabled:opacity-30 motion-reduce:transition-none [&>svg]:size-5"
              >
                <ChevronRight />
              </IconButton>
            </>
          )}
        </div>
        <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          Announcement {safeIndex + 1} of {total}: {announcement.title}
        </span>
      </DialogContent>
    </Dialog>
  );
};
