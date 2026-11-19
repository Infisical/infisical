import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  ArrowLeftRightIcon,
  BanIcon,
  ClipboardListIcon,
  GlobeIcon,
  ImageIcon,
  InfoIcon,
  type LucideIcon,
  MousePointerClickIcon,
  SearchIcon
} from "lucide-react";

import { HighlightText } from "@app/components/utilities/HighlightText";
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton
} from "@app/components/v3";
import { isBrokenChunkMarker, TBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";
import { isWebSessionEvent, TWebScreenshotEvent, TWebSessionEvent } from "@app/hooks/api/pam/types";

import {
  buildWebLogEntries,
  describeWebEvent,
  TWebLogKind,
  WEB_LOG_FILTER_LABELS,
  WebLogFilter
} from "./webSessionLog";

const ROW_HEIGHT_ESTIMATE = 44;
const FOLLOW_THRESHOLD_PX = 48;

const KIND_PRESENTATION: Record<TWebLogKind, { icon: LucideIcon; className: string }> = {
  page: { icon: GlobeIcon, className: "text-info" },
  request: { icon: ArrowLeftRightIcon, className: "text-muted" },
  input: { icon: MousePointerClickIcon, className: "text-product-pam" },
  session: { icon: InfoIcon, className: "text-muted" },
  blocked: { icon: BanIcon, className: "text-danger" },
  screenshot: { icon: ImageIcon, className: "text-muted" }
};

const screenshotSrc = (shot: TWebScreenshotEvent) => `data:image/jpeg;base64,${shot.jpeg}`;

const formatElapsed = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${mmss}` : mmss;
};

type Props = {
  events: unknown[];
  isActive: boolean;
  isLoading: boolean;
  error?: string;
};

export const WebSessionLogView = ({ events, isActive, isLoading, error }: Props) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WebLogFilter>(WebLogFilter.All);
  const [showStaticAssets, setShowStaticAssets] = useState(false);
  const [openScreenshot, setOpenScreenshot] = useState<TWebScreenshotEvent | null>(null);

  const { webEvents, brokenChunks } = useMemo(() => {
    const web: TWebSessionEvent[] = [];
    const broken: TBrokenChunkMarker[] = [];
    events.forEach((event) => {
      if (isBrokenChunkMarker(event)) broken.push(event);
      else if (isWebSessionEvent(event)) web.push(event);
    });
    return { webEvents: web, brokenChunks: broken };
  }, [events]);

  const entries = useMemo(
    () => buildWebLogEntries(webEvents, { filter, search, showStaticAssets }),
    [webEvents, filter, search, showStaticAssets]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const isFollowingRef = useRef(true);
  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 12
  });

  useEffect(() => {
    if (!isActive || !isFollowingRef.current || entries.length === 0) return;
    virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
  }, [entries.length, isActive, virtualizer]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    isFollowingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
  };

  let content;
  if (error) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <AlertTriangleIcon className="size-6 text-danger" />
          <EmptyTitle>Failed to load session activity</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else if (isLoading && webEvents.length === 0) {
    content = (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`web-log-skeleton-${i + 1}`} className="h-4 w-full" />
        ))}
      </div>
    );
  } else if (entries.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <ClipboardListIcon className="size-6 text-muted" />
          <EmptyTitle>
            {webEvents.length === 0 ? "No activity recorded yet" : "No activity matches"}
          </EmptyTitle>
          <EmptyDescription>
            {webEvents.length === 0
              ? "Pages, requests and clicks appear here as the session records them."
              : "Change the search or filter to see more."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    content = (
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="max-h-[60vh] thin-scrollbar overflow-auto rounded-md border border-border bg-popover"
      >
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const { event, row, screenshot: attached } = entries[item.index];
            const screenshot = attached ?? (event.eventType === "screenshot" ? event : undefined);
            const { icon: Icon, className: iconClass } = KIND_PRESENTATION[row.kind];
            return (
              <div
                key={item.key}
                ref={virtualizer.measureElement}
                data-index={item.index}
                className={`absolute top-0 left-0 flex w-full gap-3 border-b border-border px-3 py-2 last:border-b-0 ${
                  row.kind === "blocked" ? "bg-danger/5" : ""
                }`}
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <span
                  className="w-12 shrink-0 pt-0.5 font-mono text-[11px] text-muted tabular-nums"
                  title={format(new Date(event.timestamp), "MMM d, yyyy h:mm:ss a")}
                >
                  {formatElapsed(event.elapsedTime)}
                </span>
                <Icon className={`mt-0.5 size-3.5 shrink-0 ${iconClass}`} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={`truncate text-xs ${
                      row.kind === "request" || row.kind === "page" ? "font-mono" : ""
                    } ${row.kind === "blocked" ? "text-danger" : "text-foreground"}`}
                    title={row.title}
                  >
                    <HighlightText text={row.title} highlight={search} />
                  </span>
                  {(row.detail || row.meta.length > 0) && (
                    <span className="truncate text-[11px] text-muted" title={row.detail}>
                      {row.meta.length > 0 && (
                        <HighlightText text={row.meta.join(" · ")} highlight={search} />
                      )}
                      {row.meta.length > 0 && row.detail && " · "}
                      {row.detail && <HighlightText text={row.detail} highlight={search} />}
                    </span>
                  )}
                </div>
                {screenshot && (
                  <button
                    type="button"
                    className="shrink-0 cursor-zoom-in overflow-hidden rounded border border-border hover:border-foreground/30"
                    onClick={() => setOpenScreenshot(screenshot)}
                    aria-label="Open screenshot"
                  >
                    <img
                      src={screenshotSrc(screenshot)}
                      alt={describeWebEvent(screenshot)?.title ?? "Screenshot"}
                      loading="lazy"
                      decoding="async"
                      className="block h-12 w-auto max-w-24 object-cover object-top"
                    />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="min-w-48 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity..."
          />
        </InputGroup>
        <Select value={filter} onValueChange={(value) => setFilter(value as WebLogFilter)}>
          <SelectTrigger className="w-40" aria-label="Filter activity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {Object.values(WebLogFilter).map((value) => (
              <SelectItem key={value} value={value}>
                {WEB_LOG_FILTER_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="web-log-static-assets"
            isChecked={showStaticAssets}
            onCheckedChange={(checked) => setShowStaticAssets(checked === true)}
          />
          <Label htmlFor="web-log-static-assets" className="text-xs text-muted">
            Static assets
          </Label>
        </div>
      </div>
      {brokenChunks.length > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-warning/5 px-3 py-2 text-xs text-warning">
          <AlertTriangleIcon className="size-3.5 shrink-0" />
          <span>
            {brokenChunks.length === 1
              ? "Part of this session's activity could not be loaded."
              : `${brokenChunks.length} parts of this session's activity could not be loaded.`}
          </span>
        </div>
      )}
      {content}
      <Dialog
        open={Boolean(openScreenshot)}
        onOpenChange={(open) => {
          if (!open) setOpenScreenshot(null);
        }}
      >
        {openScreenshot && (
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>{describeWebEvent(openScreenshot)?.title}</DialogTitle>
              <DialogDescription>
                {format(new Date(openScreenshot.timestamp), "MMM d, yyyy h:mm:ss a")} ·{" "}
                {describeWebEvent(openScreenshot)?.meta.join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <img
              src={screenshotSrc(openScreenshot)}
              alt={describeWebEvent(openScreenshot)?.title ?? "Screenshot"}
              className="h-auto w-full rounded-md border border-border"
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
};
