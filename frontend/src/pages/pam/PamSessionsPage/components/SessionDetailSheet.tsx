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

type Props = {
  sessionId?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTerminate: (session: TPamSession) => void;
};

const getLogText = (log: TPamSessionLog): string => {
  if ("input" in log && "output" in log) {
    return [log.input, log.output].filter(Boolean).join(" ");
  }
  if ("data" in log) {
    try {
      const bytes = Uint8Array.from(atob(log.data), (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return log.data;
    }
  }
  if ("method" in log) {
    return `${log.method} ${log.url}`;
  }
  if ("status" in log) {
    return `Response ${log.status}`;
  }
  return "";
};

const DESTRUCTIVE_PREFIXES = ["DROP ", "DELETE ", "TRUNCATE ", "ALTER "];

const isDestructiveQuery = (text: string): boolean => {
  const upper = text.trimStart().toUpperCase();
  return DESTRUCTIVE_PREFIXES.some((prefix) => upper.startsWith(prefix));
};

const LogEntry = ({ log, highlight }: { log: TPamSessionLog; highlight: string }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const text = getLogText(log);

  const textRef = useCallback(
    (node: HTMLElement | null) => {
      if (node && !expanded) {
        setOverflows(node.scrollWidth > node.clientWidth);
      }
    },
    [expanded]
  );

  if (!text) return null;

  const destructive = isDestructiveQuery(text);
  const expandable = overflows || expanded;

  const body = (
    <>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-mono text-[11px] tracking-tight text-muted">
          {format(new Date(log.timestamp), "MMM d, h:mm:ss a")}
        </span>
        {destructive && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
            <AlertTriangleIcon className="size-3" />
            Destructive
          </span>
        )}
      </div>
      <div className="flex items-start gap-2">
        {expandable && (
          <ChevronRightIcon
            className={`mt-0.5 size-3.5 shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`}
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
    </>
  );

  const rowClass = `border-b border-border px-4 py-2.5 transition-colors last:border-b-0 ${
    destructive ? "bg-danger/5" : ""
  }`;

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

  const filteredEvents = useMemo(() => {
    const term = logSearch.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (event) =>
        !isBrokenChunkMarker(event) &&
        getLogText(event as TPamSessionLog)
          .toLowerCase()
          .includes(term)
    );
  }, [events, logSearch]);

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
    logContent = (
      <div>
        {filteredEvents.map((event, i) => {
          if (isBrokenChunkMarker(event)) {
            return (
              <div
                key={`broken-chunk-${event.chunkIndex}`}
                className="flex items-center gap-2 border-b border-border bg-warning/5 px-4 py-2 text-xs text-warning last:border-b-0"
              >
                <AlertTriangleIcon className="size-3.5 shrink-0" />
                <span>{event.message}</span>
              </div>
            );
          }

          const log = event as TPamSessionLog;
          return <LogEntry key={`log-${log.timestamp}-${i + 1}`} log={log} highlight={logSearch} />;
        })}
      </div>
    );
  }

  const isRdpSession =
    session.accountType === PamAccountType.Windows ||
    session.accountType === PamAccountType.WindowsAd;

  const tabs = isRdpSession
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
                      <RdpReplayView events={filteredEvents} isStreaming={isActive} />
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
