import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronRightIcon,
  CompassIcon,
  DownloadIcon,
  KeyboardIcon,
  LogInIcon,
  LogOutIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  MoveVerticalIcon,
  SearchIcon,
  ShieldBanIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  ButtonGroup,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import { capitalize } from "../../constants";
import {
  filterBrowserTimeline,
  formatBytes,
  formatPlaybackTime,
  indexAtOrBefore,
  isFailedRequest,
  isWriteMethod,
  matchesTimelineFilter,
  splitUrl,
  TBrowserHeaders,
  TBrowserInputGroup,
  TBrowserRequest,
  TBrowserTimelineFilter,
  TBrowserTimelineRow
} from "./browserReplay";

const ROW_ESTIMATE_PX = 30;

const NEAR_PLAYHEAD_MS = 1500;

// After the user scrolls the list, playback leaves its position alone for this long
const USER_SCROLL_HOLD_MS = 4000;

const STATIC_RESOURCE_TYPES = ["Script", "Stylesheet", "Image", "Font", "Media"];

const FILTERS: { value: TBrowserTimelineFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "writes", label: "Writes" },
  { value: "errors", label: "Errors" },
  { value: "blocked", label: "Blocked" }
];

const SESSION_END_LABELS: Record<string, string> = {
  completed: "Session reached its maximum duration",
  expired: "Session access expired",
  terminated: "Session terminated or access revoked",
  idle: "Session ended after being idle",
  user_quit: "User ended the session",
  browser_stopped: "Remote browser stopped unexpectedly",
  capacity: "No browser was available on the gateway",
  error: "Session ended with an error"
};

const CLICK_VERBS: Record<string, string> = {
  click: "Clicked",
  double_click: "Double-clicked",
  right_click: "Right-clicked"
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

const describeInput = (input: TBrowserInputGroup): string => {
  const into = input.target ? ` into ${input.target}` : "";
  switch (input.kind) {
    case "key":
      if (!input.text) {
        return `Pressed ${plural(input.count, "key")}${input.target ? ` in ${input.target}` : ""}`;
      }
      if (input.textlessCount > 0) {
        return `Typed "${input.text}" and ${plural(input.textlessCount, "other key")}${into}`;
      }
      return `Typed "${input.text}"${into}`;
    case "text":
      return `Entered "${input.text ?? ""}"${into}`;
    case "scroll":
      return input.target ? `Scrolled ${input.target}` : "Scrolled the page";
    default: {
      const verb = CLICK_VERBS[input.kind] ?? "Clicked";
      if (input.target) return `${verb} ${input.target}`;
      if (input.x === undefined || input.y === undefined) return verb;
      return `${verb} at ${Math.round(input.x)}, ${Math.round(input.y)}`;
    }
  }
};

const describeSessionEnd = (reason: string) =>
  SESSION_END_LABELS[reason] ?? (reason ? `Session ended (${reason})` : "Session ended");

const statusTone = (status: number) => {
  if (status === 0 || status >= 500) return "text-danger";
  if (status >= 400) return "text-warning";
  return "text-foreground";
};

const formatBody = (body: string, mimeType: string) => {
  const trimmed = body.trim();
  if (!mimeType.includes("json") && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return body;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return body;
  }
};

const contentTypeOf = (headers: TBrowserHeaders) =>
  Object.entries(headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";

export const UrlText = ({
  url,
  isMuted = false,
  className
}: {
  url: string;
  isMuted?: boolean;
  className?: string;
}) => {
  const { host, path } = splitUrl(url);
  return (
    <span className={cn("min-w-0 truncate", className)} title={url}>
      {host && <span className="text-muted">{host}</span>}
      <span className={isMuted ? "text-accent" : "text-foreground"}>{path}</span>
    </span>
  );
};

const HeaderList = ({ title, headers }: { title: string; headers: TBrowserHeaders }) => {
  const entries = Object.entries(headers);
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-accent">{title}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-muted">No headers recorded</p>
      ) : (
        <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11px] leading-relaxed">
          {entries.map(([name, value]) => (
            <div key={name} className="contents">
              <dt className="break-all text-muted">{name}</dt>
              <dd className="break-all text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

const BodyBlock = ({
  title,
  body,
  bodySize,
  mimeType
}: {
  title: string;
  body?: string;
  bodySize: number;
  mimeType: string;
}) => {
  let content: ReactNode;
  if (body) {
    content = (
      <pre className="max-h-72 thin-scrollbar overflow-auto rounded border border-border bg-popover px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-foreground">
        {formatBody(body, mimeType)}
      </pre>
    );
  } else {
    content = (
      <p className="text-xs text-muted">{bodySize > 0 ? "Body not recorded" : "No body"}</p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-accent">
        {title}
        {bodySize > 0 && <span className="text-muted"> · {formatBytes(bodySize)}</span>}
      </p>
      {content}
    </div>
  );
};

const RequestDetails = ({ request }: { request: TBrowserRequest }) => {
  const { response } = request;
  return (
    <div className="flex flex-col gap-3 border-t border-border bg-container px-3 py-3">
      <p className="font-mono text-[11px] leading-relaxed break-all text-foreground">
        {request.method} {request.url}
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Type <span className="text-foreground">{request.resourceType}</span>
        </span>
        {response && (
          <>
            <span>
              Status{" "}
              <span className={statusTone(response.status)}>
                {response.status} {response.statusText}
              </span>
            </span>
            {response.mimeType && (
              <span>
                MIME <span className="text-foreground">{response.mimeType}</span>
              </span>
            )}
            <span>
              Responded after{" "}
              <span className="text-foreground">
                {Math.max(0, Math.round(response.elapsedMs - request.elapsedMs))} ms
              </span>
            </span>
            {response.fromCache && <span className="text-foreground">From cache</span>}
          </>
        )}
      </div>
      <HeaderList title="Request Headers" headers={request.headers} />
      <BodyBlock
        title="Request Body"
        body={request.body}
        bodySize={request.bodySize}
        mimeType={contentTypeOf(request.headers)}
      />
      {response ? (
        <>
          <HeaderList title="Response Headers" headers={response.headers} />
          <BodyBlock
            title="Response Body"
            body={response.body}
            bodySize={response.bodySize}
            mimeType={response.mimeType}
          />
        </>
      ) : (
        <p className="text-xs text-muted">No response recorded</p>
      )}
    </div>
  );
};

const RowIcon = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cn("flex text-muted [&>svg]:size-3.5", className)}>{children}</span>
);

const RowContent = ({ row, isStreaming }: { row: TBrowserTimelineRow; isStreaming: boolean }) => {
  switch (row.kind) {
    case "request": {
      const { request } = row;
      const isStatic = STATIC_RESOURCE_TYPES.includes(request.resourceType);
      const failed = isFailedRequest(request, isStreaming);
      let missingStatus = { label: "—", title: "No response recorded" };
      if (failed) missingStatus = { label: "Failed", title: "No response was recorded" };
      else if (isStreaming) missingStatus = { label: "…", title: "Waiting for a response" };
      return (
        <>
          <span
            className={cn(
              "font-mono",
              isWriteMethod(request.method) ? "text-foreground" : "text-accent"
            )}
          >
            {request.method}
          </span>
          <UrlText url={request.url} isMuted={isStatic} className="font-mono" />
          <span className="flex items-center justify-end gap-2 font-mono tabular-nums">
            {request.response ? (
              <span className={statusTone(request.response.status)}>
                {request.response.status || "Failed"}
              </span>
            ) : (
              <span className={failed ? "text-danger" : "text-muted"} title={missingStatus.title}>
                {missingStatus.label}
              </span>
            )}
            <span className="w-14 text-right text-muted">
              {request.response ? formatBytes(request.response.bodySize) : "—"}
            </span>
          </span>
        </>
      );
    }
    case "blocked":
      return (
        <>
          <span className="font-mono text-accent">{row.blocked.method}</span>
          <UrlText url={row.blocked.url} className="font-mono" />
          <Badge variant="warning">
            <ShieldBanIcon />
            Blocked
          </Badge>
        </>
      );
    case "input": {
      const isTyping = row.input.kind === "key" || row.input.kind === "text";
      let icon = <MousePointerClickIcon />;
      if (isTyping) icon = <KeyboardIcon />;
      else if (row.input.kind === "scroll") icon = <MoveVerticalIcon />;
      const label = describeInput(row.input);
      return (
        <>
          <RowIcon>{icon}</RowIcon>
          <span className="col-span-2 min-w-0 truncate text-foreground" title={label}>
            {label}
          </span>
        </>
      );
    }
    case "navigation":
      return (
        <>
          <RowIcon className="text-info">
            <CompassIcon />
          </RowIcon>
          <span className="col-span-2 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted">Navigated to</span>
            <UrlText url={row.navigation.url} className="font-mono" />
            {row.navigation.title && (
              <span className="min-w-0 shrink truncate text-muted" title={row.navigation.title}>
                · {row.navigation.title}
              </span>
            )}
          </span>
        </>
      );
    case "dialog": {
      const label = `${capitalize(row.dialog.kind)} dialog: "${row.dialog.message}"`;
      return (
        <>
          <RowIcon>
            <MessageSquareIcon />
          </RowIcon>
          <span className="truncate text-foreground" title={label}>
            {label}
          </span>
          <span className="text-right text-muted">
            {row.dialog.accepted ? "Accepted" : "Dismissed"}
          </span>
        </>
      );
    }
    case "download": {
      const name = row.download.filename || row.download.url;
      return (
        <>
          <RowIcon>
            <DownloadIcon />
          </RowIcon>
          <span className="truncate text-foreground" title={row.download.url}>
            {row.download.allowed ? "Downloaded" : "Tried to download"} {name}
          </span>
          {row.download.allowed ? (
            <span className="text-right text-muted">Allowed</span>
          ) : (
            <Badge variant="warning">
              <ShieldBanIcon />
              Blocked
            </Badge>
          )}
        </>
      );
    }
    case "gap":
      return (
        <>
          <RowIcon className="text-warning">
            <TriangleAlertIcon />
          </RowIcon>
          <span className="col-span-2 truncate text-warning" title={row.gap.message}>
            Recording chunk {row.gap.chunkIndex} couldn&apos;t be loaded: {row.gap.message}
          </span>
        </>
      );
    case "session_start":
      return (
        <>
          <RowIcon>
            <LogInIcon />
          </RowIcon>
          <span className="col-span-2 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-muted">Session started at</span>
            <UrlText url={row.start.url} className="font-mono" />
          </span>
        </>
      );
    case "session_end":
      return (
        <>
          <RowIcon>
            <LogOutIcon />
          </RowIcon>
          <span className="col-span-2 truncate text-foreground">
            {describeSessionEnd(row.end.reason)}
          </span>
        </>
      );
    default:
      return null;
  }
};

type RowProps = {
  row: TBrowserTimelineRow;
  isNearPlayhead: boolean;
  isExpanded: boolean;
  isStreaming: boolean;
  onSelect: (row: TBrowserTimelineRow) => void;
};

const TimelineRow = memo(
  ({ row, isNearPlayhead, isExpanded, isStreaming, onSelect }: RowProps) => {
    const isExpandable = row.kind === "request";
    return (
      <div className={cn("border-b border-border", row.kind === "gap" && "bg-warning/5")}>
        <button
          type="button"
          onClick={() => onSelect(row)}
          aria-expanded={isExpandable ? isExpanded : undefined}
          className={cn(
            "grid w-full cursor-pointer grid-cols-[3.75rem_3.25rem_minmax(0,1fr)_auto] items-center gap-x-2 py-1.5 pr-3 pl-1.5 text-left text-xs transition-colors hover:bg-container-hover",
            isNearPlayhead && "bg-surface-active",
            isExpanded && "bg-container"
          )}
        >
          <span className="flex items-center gap-0.5 font-mono text-muted tabular-nums">
            <ChevronRightIcon
              className={cn(
                "size-3 shrink-0 transition-transform",
                isExpandable ? "text-muted" : "invisible",
                isExpanded && "rotate-90"
              )}
            />
            {formatPlaybackTime(row.elapsedMs)}
          </span>
          <RowContent row={row} isStreaming={isStreaming} />
        </button>
        {isExpanded && row.kind === "request" && <RequestDetails request={row.request} />}
      </div>
    );
  }
);

TimelineRow.displayName = "TimelineRow";

type Props = {
  rows: TBrowserTimelineRow[];
  currentMs: number;
  isPlaying: boolean;
  isStreaming: boolean;
  onSeek: (ms: number) => void;
  className?: string;
};

export const BrowserReplayTimeline = ({
  rows,
  currentMs,
  isPlaying,
  isStreaming,
  onSeek,
  className
}: Props) => {
  const [filter, setFilter] = useState<TBrowserTimelineFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserScrollRef = useRef(0);

  const visible = useMemo(
    () => filterBrowserTimeline(rows, { filter, search, isStreaming }),
    [rows, filter, search, isStreaming]
  );

  const counts = useMemo(
    () =>
      Object.fromEntries(
        FILTERS.map(({ value }) => [
          value,
          rows.filter((row) => matchesTimelineFilter(row, value, isStreaming)).length
        ])
      ) as Record<TBrowserTimelineFilter, number>,
    [rows, isStreaming]
  );

  const virtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    getItemKey: (index) => visible[index].key,
    overscan: 12
  });

  const playheadIndex = indexAtOrBefore(visible, currentMs);

  useEffect(() => {
    if (!isPlaying || playheadIndex < 0) return;
    if (Date.now() - lastUserScrollRef.current < USER_SCROLL_HOLD_MS) return;
    virtualizer.scrollToIndex(playheadIndex, { align: "auto" });
  }, [playheadIndex, isPlaying]);

  const onSelect = useCallback(
    (row: TBrowserTimelineRow) => {
      onSeek(row.elapsedMs);
      if (row.kind === "request") {
        setExpandedKey((current) => (current === row.key ? null : row.key));
      }
    },
    [onSeek]
  );

  const markUserScroll = () => {
    lastUserScrollRef.current = Date.now();
  };

  const isFiltered = filter !== "all" || search.trim().length > 0;

  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <ButtonGroup aria-label="Filter activity">
        {FILTERS.map(({ value, label }) => (
          <Button
            key={value}
            size="xs"
            variant={filter === value ? "pam" : "outline"}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label}
            <span className="text-muted tabular-nums">{counts[value]}</span>
          </Button>
        ))}
      </ButtonGroup>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search URLs..."
          aria-label="Search URLs"
        />
        {search && (
          <InputGroupAddon align="inline-end">
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Clear search"
              onClick={() => setSearch("")}
            >
              <XIcon />
            </IconButton>
          </InputGroupAddon>
        )}
      </InputGroup>
      {visible.length === 0 ? (
        <Empty className="border @5xl:flex-1">
          <EmptyHeader>
            <EmptyTitle>
              {isFiltered ? "No activity matches these filters" : "No activity recorded yet"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? "Try a different filter or search term."
                : "Requests, clicks and page changes appear here as the session records them."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          ref={scrollRef}
          onWheel={markUserScroll}
          onTouchMove={markUserScroll}
          onPointerDown={markUserScroll}
          className="h-[26rem] thin-scrollbar overflow-y-auto rounded-md border border-border bg-popover [overflow-anchor:none] @5xl:h-0 @5xl:min-h-64 @5xl:flex-1"
        >
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = visible[item.index];
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute top-0 left-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <TimelineRow
                    row={row}
                    isNearPlayhead={
                      row.elapsedMs <= currentMs && row.elapsedMs > currentMs - NEAR_PLAYHEAD_MS
                    }
                    isExpanded={expandedKey === row.key}
                    isStreaming={isStreaming}
                    onSelect={onSelect}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
