import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangleIcon,
  Ban,
  ChevronRightIcon,
  ClipboardListIcon,
  MonitorPlayIcon,
  MoreHorizontalIcon,
  SearchIcon
} from "lucide-react";

import { HighlightText } from "@app/components/v2/HighlightText";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Skeleton
} from "@app/components/v3";
import {
  PamAccountType,
  PamResourcePermissionActions,
  PamResourcePermissionSub,
  PamSessionStatus,
  useGetPamSessionById,
  usePamAccountTypeMap
} from "@app/hooks/api/pam";
import { usePamAccountPermission } from "@app/hooks/api/pam/queries";
import { useDecryptedSessionLogs } from "@app/hooks/api/pam/session-playback/queries";
import { isBrokenChunkMarker } from "@app/hooks/api/pam/session-playback/types";
import { TPamSession, TPamSessionLog } from "@app/hooks/api/pam/types";

import { LiveDot } from "../../components/LiveDot";
import { PamDetailSheet } from "../../components/PamDetailSheet";
import { capitalize, formatDuration, STATUS_BADGE } from "../constants";

const RdpReplayView = lazy(() => import("./RdpReplayView/RdpReplayView"));
const WebAppReplayView = lazy(() => import("./WebAppReplayView"));

type Props = {
  sessionId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminate: (session: TPamSession) => void;
};

const decodeBase64Utf8 = (b64: string): string => {
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return b64;
  }
};

// matches ANSI/VT escape sequences emitted by a terminal (colors, cursor moves, etc.)
const ANSI_ESCAPE_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;

// turns raw terminal bytes into readable log text by stripping escape sequences
const cleanTerminalOutput = (raw: string): string =>
  raw
    .replace(ANSI_ESCAPE_REGEX, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .trim();

const getLogText = (log: TPamSessionLog): string => {
  if ("input" in log && "output" in log) {
    return [log.input, log.output].filter(Boolean).join(" ");
  }
  if ("data" in log) {
    // resize events carry window dimensions, not terminal content. skip them
    if (log.eventType === "resize") return "";
    return cleanTerminalOutput(decodeBase64Utf8(log.data));
  }
  if ("method" in log) {
    return `${log.method} ${log.url}`;
  }
  if ("status" in log) {
    return `Response ${log.status}`;
  }
  return "";
};

const getLogBody = (log: TPamSessionLog): string | null => {
  if (!("body" in log) || !log.body) return null;
  const decoded = decodeBase64Utf8(log.body);
  try {
    return JSON.stringify(JSON.parse(decoded), null, 2);
  } catch {
    return decoded;
  }
};

const DESTRUCTIVE_PREFIXES = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];

const isDestructiveQuery = (text: string): boolean => {
  const upper = text.trimStart().toUpperCase();
  return DESTRUCTIVE_PREFIXES.some((prefix) => upper.startsWith(prefix));
};

const LogEntry = ({
  text,
  bodyText,
  highlight,
  showTimestamp,
  timestampLabel,
  separatorAbove,
  isGroupEnd
}: {
  text: string;
  bodyText: string | null;
  highlight: string;
  showTimestamp: boolean;
  timestampLabel: string;
  separatorAbove: boolean;
  isGroupEnd: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const textRef = useCallback(
    (node: HTMLElement | null) => {
      if (node && !expanded) {
        setOverflows(node.scrollWidth > node.clientWidth);
      }
    },
    [expanded]
  );

  if (!text) return null;

  const term = highlight.trim().toLowerCase();
  const bodyMatch = Boolean(bodyText) && term.length > 0 && bodyText!.toLowerCase().includes(term);
  const showBody = Boolean(bodyText) && (expanded || bodyMatch);

  const destructive = isDestructiveQuery(text);
  const expandable = overflows || expanded || Boolean(bodyText);

  const body = (
    <>
      {(showTimestamp || destructive) && (
        <div className="mb-1 flex items-center gap-2">
          {showTimestamp && (
            <span className="font-mono text-[11px] tracking-tight text-muted">
              {timestampLabel}
            </span>
          )}
          {destructive && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
              <AlertTriangleIcon className="size-3" />
              Destructive
            </span>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        {expandable && (
          <ChevronRightIcon
            className={`mt-0.5 size-3.5 shrink-0 text-muted transition-transform ${showBody || expanded ? "rotate-90" : ""}`}
          />
        )}
        <code
          ref={textRef}
          className={`min-w-0 flex-1 font-mono text-xs leading-relaxed ${
            expanded ? "break-all whitespace-pre-wrap" : "truncate"
          } ${destructive ? "text-danger" : "text-foreground"}`}
        >
          <HighlightText text={text} highlight={highlight} />
        </code>
      </div>
      {showBody && bodyText && (
        <pre className="mt-1.5 max-h-96 thin-scrollbar overflow-auto rounded bg-container px-3 py-2 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-muted">
          <HighlightText text={bodyText} highlight={highlight} />
        </pre>
      )}
    </>
  );

  // lines in the same timestamp group flow together tightly with no separators
  const rowClass = `px-4 transition-colors ${separatorAbove ? "border-t border-border" : ""} ${
    showTimestamp ? "pt-2.5" : "pt-0.5"
  } ${isGroupEnd ? "pb-2.5" : "pb-0.5"} ${destructive ? "bg-danger/5" : ""}`;

  if (expandable) {
    return (
      <button
        type="button"
        className={`block w-full cursor-pointer text-left hover:bg-container-hover ${rowClass}`}
        onClick={() => setExpanded((prev) => !prev)}
      >
        {body}
      </button>
    );
  }

  return <div className={rowClass}>{body}</div>;
};

export const SessionDetailSheet = ({ sessionId, isOpen, onOpenChange, onTerminate }: Props) => {
  const { map: accountTypeMap } = usePamAccountTypeMap();
  const [logSearch, setLogSearch] = useState("");

  useEffect(() => {
    setLogSearch("");
  }, [sessionId]);

  const { data: session, isLoading } = useGetPamSessionById(sessionId ?? "");
  const isActive = session?.status === PamSessionStatus.Active;

  const { data: accountPerm } = usePamAccountPermission(session?.accountId ?? "");
  const canTerminate = accountPerm?.permission.can(
    PamResourcePermissionActions.TerminateSessions,
    PamResourcePermissionSub.PamResource
  );

  const {
    events,
    loading: isLogsLoading,
    error: logsError
  } = useDecryptedSessionLogs(sessionId ?? "", isOpen && !!sessionId, isActive);

  const decoded = useMemo(
    () =>
      new Map<unknown, { text: string; body: string | null }>(
        events
          .filter((event) => !isBrokenChunkMarker(event))
          .map((event) => {
            const log = event as TPamSessionLog;
            return [event, { text: getLogText(log), body: getLogBody(log) }] as const;
          })
      ),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    if (!term) return events;
    return events.filter((event) => {
      const d = decoded.get(event);
      if (!d) return false;
      return `${d.text}\n${d.body ?? ""}`.toLowerCase().includes(term);
    });
  }, [events, logSearch, decoded]);

  if (!session) {
    return <PamDetailSheet isOpen={isOpen} onOpenChange={onOpenChange} isLoading={isLoading} />;
  }

  const statusConfig = STATUS_BADGE[session.status];
  const typeName = accountTypeMap[session.accountType]?.name ?? session.accountType;

  const emptyValue = <span className="text-muted">—</span>;
  const duration = formatDuration(session);

  const metadata: { label: string; value: ReactNode }[] = [
    {
      label: "Status",
      value: (
        <Badge variant={statusConfig.variant}>
          {isActive && <LiveDot />}
          {capitalize(session.status)}
        </Badge>
      )
    },
    { label: "Email", value: session.actorEmail },
    { label: "Folder", value: session.folderName || emptyValue },
    {
      label: "Started",
      value: session.startedAt
        ? format(new Date(session.startedAt), "MMM d, yyyy h:mm a")
        : emptyValue
    },
    {
      label: "Ended",
      value: session.endedAt ? format(new Date(session.endedAt), "MMM d, yyyy h:mm a") : "Ongoing"
    },
    { label: "Duration", value: duration === "—" ? emptyValue : duration },
    { label: "IP Address", value: session.actorIp },
    ...(session.reason ? [{ label: "Reason", value: session.reason }] : [])
  ];

  const actions =
    isActive && canTerminate ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" size="xs" aria-label="Session actions" className="text-muted">
            <MoreHorizontalIcon className="size-4" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem variant="danger" onClick={() => onTerminate(session)}>
            <Ban />
            Terminate Session
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : undefined;

  const showLogSkeleton = isLogsLoading && filteredEvents.length === 0;

  let logContent: ReactNode;
  if (logsError) {
    logContent = (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <AlertTriangleIcon className="size-6 text-danger" />
        <p className="text-sm text-muted">Failed to load session logs.</p>
      </div>
    );
  } else if (showLogSkeleton) {
    logContent = (
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`log-skeleton-${i + 1}`} className="h-4 w-full" />
        ))}
      </div>
    );
  } else if (filteredEvents.length === 0) {
    logContent = (
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <ClipboardListIcon className="size-6 text-muted" />
        <p className="text-sm text-muted">
          {logSearch ? "No logs match your search" : "No logs recorded for this session"}
        </p>
      </div>
    );
  } else {
    // first pass: resolve which rows render and collapse repeated timestamps
    let prevTimestampLabel: string | null = null;
    const items: (
      | { kind: "marker"; key: string; message: string }
      | {
          kind: "log";
          key: string;
          text: string;
          bodyText: string | null;
          showTimestamp: boolean;
          timestampLabel: string;
        }
    )[] = [];

    filteredEvents.forEach((event, i) => {
      if (isBrokenChunkMarker(event)) {
        prevTimestampLabel = null;
        items.push({
          kind: "marker",
          key: `broken-chunk-${event.chunkIndex}`,
          message: event.message
        });
        return;
      }

      const log = event as TPamSessionLog;
      const d = decoded.get(event);
      const text = d?.text ?? "";

      if (!text) return;

      const timestampLabel = format(new Date(log.timestamp), "MMM d, h:mm:ss a");
      const showTimestamp = timestampLabel !== prevTimestampLabel;
      prevTimestampLabel = timestampLabel;

      items.push({
        kind: "log",
        key: `log-${log.timestamp}-${i + 1}`,
        text,
        bodyText: d?.body ?? null,
        showTimestamp,
        timestampLabel
      });
    });

    // second pass: a log line ends its group when the next rendered row starts a new group or isn't a log line
    const rows = items.map((item, idx) => {
      const separatorAbove = idx > 0 && (item.kind === "marker" || item.showTimestamp);

      if (item.kind === "marker") {
        return (
          <div
            key={item.key}
            className={`flex items-center gap-2 bg-warning/5 px-4 py-2 text-xs text-warning ${
              separatorAbove ? "border-t border-border" : ""
            }`}
          >
            <AlertTriangleIcon className="size-3.5 shrink-0" />
            <span>{item.message}</span>
          </div>
        );
      }

      const next = items[idx + 1];
      const isGroupEnd = !next || next.kind === "marker" || next.showTimestamp;

      return (
        <LogEntry
          key={item.key}
          text={item.text}
          bodyText={item.bodyText}
          highlight={logSearch}
          showTimestamp={item.showTimestamp}
          timestampLabel={item.timestampLabel}
          separatorAbove={separatorAbove}
          isGroupEnd={isGroupEnd}
        />
      );
    });

    logContent =
      rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
          <ClipboardListIcon className="size-6 text-muted" />
          <p className="text-sm text-muted">
            {logSearch ? "No logs match your search" : "No logs recorded for this session"}
          </p>
        </div>
      ) : (
        <div>{rows}</div>
      );
  }

  const isRdpSession =
    session.accountType === PamAccountType.Windows ||
    session.accountType === PamAccountType.WindowsAd;
  const isWebAppSession = session.accountType === PamAccountType.WebApp;
  const isRecordingSession = isRdpSession || isWebAppSession;

  const tabs = isRecordingSession
    ? [
        {
          value: "recording",
          label: "Session Recording",
          icon: <MonitorPlayIcon className="mr-1.5 size-4" />,
          content: (
            <div className="flex flex-1 flex-col gap-4 p-4">
              <Card>
                <CardHeader className="flex items-center justify-between border-b">
                  <CardTitle className="text-base">Session Recording</CardTitle>
                  {isActive && (
                    <Badge variant="pam">
                      <LiveDot className="bg-product-pam" />
                      Live
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {showLogSkeleton ? (
                    <div className="flex flex-col gap-2 p-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={`rec-skeleton-${i + 1}`} className="h-4 w-full" />
                      ))}
                    </div>
                  ) : (
                    <Suspense
                      fallback={
                        <div className="flex items-center justify-center p-10 text-sm text-muted">
                          Loading player...
                        </div>
                      }
                    >
                      {isWebAppSession ? (
                        <WebAppReplayView events={filteredEvents} />
                      ) : (
                        <RdpReplayView events={filteredEvents} isStreaming={isActive} />
                      )}
                    </Suspense>
                  )}
                </CardContent>
              </Card>
            </div>
          )
        }
      ]
    : [
        {
          value: "logs",
          label: "Session Logs",
          icon: <ClipboardListIcon className="mr-1.5 size-4" />,
          content: (
            <div className="flex flex-1 flex-col gap-4 p-4">
              <Card>
                <CardHeader className="flex items-center justify-between border-b">
                  <CardTitle className="text-base">Session Logs</CardTitle>
                  {isActive && (
                    <Badge variant="pam">
                      <LiveDot className="bg-product-pam" />
                      Live
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <InputGroup>
                    <InputGroupAddon>
                      <SearchIcon />
                    </InputGroupAddon>
                    <InputGroupInput
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      placeholder="Search logs..."
                    />
                  </InputGroup>
                  <div className="overflow-hidden rounded-md border border-border bg-popover">
                    {logContent}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        }
      ];

  return (
    <PamDetailSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      accountType={session.accountType}
      title={session.accountName}
      subtitle={session.actorName}
      typeBadge={typeName}
      actions={actions}
      metadata={metadata}
      tabs={tabs}
    />
  );
};
