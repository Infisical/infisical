import { useCallback, useMemo, useState } from "react";
import {
  CheckCircle,
  CheckIcon,
  ChevronRightIcon,
  CirclePlayIcon,
  Clock,
  DownloadIcon,
  FilterIcon,
  PlayIcon,
  SearchIcon,
  Shield,
  XCircle,
  XIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  DocumentationLinkBadge,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  UnstableCard,
  UnstableCardAction,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuCheckboxItem,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuLabel,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetSessionSummaries, useQueryAgentGateAuditLogs } from "@app/hooks/api";
import { TAgentGateAuditLog, TSessionSummaryMap } from "@app/hooks/api/agentGate/types";

import { SessionReplayModal } from "./SessionReplayModal";

type Session = {
  id: string;
  title: string;
  description: string;
  logs: TAgentGateAuditLog[];
  duration: number;
  approvedCount: number;
  deniedCount: number;
  createdAt: Date;
};

const formatAgentName = (id: string) =>
  id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const buildSessions = (logs: TAgentGateAuditLog[]): Session[] => {
  const grouped = new Map<string, TAgentGateAuditLog[]>();

  for (const log of logs) {
    const key = log.sessionId ?? log.id;
    const group = grouped.get(key);
    if (group) {
      group.push(log);
    } else {
      grouped.set(key, [log]);
    }
  }

  return Array.from(grouped.entries()).map(([sessionId, sessionLogs]) => {
    const sorted = [...sessionLogs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const agents = [...new Set(sorted.map((l) => formatAgentName(l.requestingAgentId)))];
    const approvedCount = sorted.filter((l) => l.result === "allowed").length;
    const deniedCount = sorted.filter((l) => l.result === "denied").length;
    const firstTs = new Date(sorted[0].timestamp).getTime();
    const lastTs = new Date(sorted[sorted.length - 1].timestamp).getTime();

    return {
      id: sessionId,
      title: `Session ${sessionId.slice(0, 8)}`,
      description: `${agents.join(", ")} — ${sorted.length} events`,
      logs: sorted,
      duration: Math.round((lastTs - firstTs) / 1000),
      approvedCount,
      deniedCount,
      createdAt: new Date(sorted[0].timestamp)
    };
  });
};

const DECISION_STATUSES = ["Approved", "Denied"] as const;

const SessionRow = ({
  session,
  summaries,
  onReplay
}: {
  session: Session;
  summaries?: TSessionSummaryMap;
  onReplay: (session: Session) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <>
      <UnstableTableRow
        className="group cursor-pointer"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <ChevronRightIcon
            className={twMerge("transition-transform", isExpanded && "rotate-90")}
          />
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <span className="font-medium">
            {summaries?.[session.id]?.summary || session.id.replace("session-", " ")}
          </span>
        </UnstableTableCell>
        <UnstableTableCell isTruncatable className={twMerge(isExpanded && "border-b-0")}>
          <span className="text-xs text-accent">
            {summaries?.[session.id]?.description || session.description}
          </span>
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <div className="flex items-center gap-2">
            <Badge variant="success">
              <CheckIcon />
              {session.approvedCount} Approved
            </Badge>
            {session.deniedCount > 0 && (
              <Badge variant="danger">
                <XIcon />
                {session.deniedCount} Denied
              </Badge>
            )}
          </div>
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <Badge variant="neutral" className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {session.duration >= 60
              ? `${Math.floor(session.duration / 60)}m ${session.duration % 60}s`
              : `${session.duration}s`}
          </Badge>
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <span className="text-xs text-accent">
            {session.createdAt.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            })}
          </span>
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <UnstableIconButton
            size="xs"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onReplay(session);
            }}
          >
            <CirclePlayIcon />
          </UnstableIconButton>
        </UnstableTableCell>
      </UnstableTableRow>
      {isExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={7} className="bg-card p-0">
            <div className="border-y-1 border-border p-6">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute top-0 bottom-0 left-[15px] w-px bg-border" />
                <div className="flex flex-col gap-0">
                  {session.logs.map((log) => {
                    const isApproved = log.result === "allowed";
                    return (
                      <div key={log.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
                        {/* Timeline node */}
                        <div className="relative z-10 ml-[5px] flex shrink-0 items-center justify-center">
                          {isApproved ? (
                            <CheckCircle className="size-5 bg-card text-success" />
                          ) : (
                            <XCircle className="size-5 bg-card text-danger" />
                          )}
                        </div>
                        {/* Event content */}
                        <div className="-mt-0.5 flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {formatAgentName(log.requestingAgentId)}
                            </span>
                            <span className="text-xs text-accent">{log.action}</span>
                            <span className="ml-auto font-mono text-xs text-muted">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </span>
                            <Badge
                              variant={isApproved ? "success" : "danger"}
                              className="text-[10px]"
                            >
                              {isApproved ? "APPROVED" : "DENIED"}
                            </Badge>
                          </div>
                          <p className="text-xs text-accent">
                            {log.agentReasoning || `${log.actionType}: ${log.action}`}
                          </p>
                          {log.policyEvaluations?.[0]?.reasoning && (
                            <div className="flex items-center gap-1 text-xs text-muted">
                              <Shield className="h-3 w-3 shrink-0" />
                              <span>&quot;{log.policyEvaluations[0].reasoning}&quot;</span>
                            </div>
                          )}
                          {log.targetAgentId && (
                            <div className="text-xs text-muted">
                              → Target:{" "}
                              <span className="font-medium">
                                {formatAgentName(log.targetAgentId)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </UnstableTableCell>
        </UnstableTableRow>
      )}
    </>
  );
};

export const SessionsTab = () => {
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [replaySession, setReplaySession] = useState<Session | null>(null);

  const { data: auditData } = useQueryAgentGateAuditLogs({
    projectId,
    limit: 200
  });

  const sessions = useMemo(() => {
    if (!auditData?.logs?.length) return [];
    return buildSessions(auditData.logs);
  }, [auditData?.logs]);

  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);

  const {
    data: summaries,
    isLoading: isSummariesLoading,
    isError: isSummariesError
  } = useGetSessionSummaries({
    sessionIds,
    projectId
  });

  const summariesReady = !isSummariesLoading || isSummariesError;

  const handleStatusToggle = useCallback(
    (status: string) =>
      setStatusFilter((prev) =>
        prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      ),
    []
  );

  const isTableFiltered = statusFilter.length > 0;
  const isFiltered = search.length > 0 || statusFilter.length > 0;

  const filteredSessions = sessions.filter((session) => {
    const sessionSummary = summaries?.[session.id];
    const searchTitle = sessionSummary?.summary || session.title;
    const searchDesc = sessionSummary?.description || session.description;
    const matchesSearch =
      searchTitle.toLowerCase().includes(search.toLowerCase()) ||
      searchDesc.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (statusFilter.length === 0) return true;
    if (statusFilter.includes("Approved") && session.approvedCount > 0) return true;
    if (statusFilter.includes("Denied") && session.deniedCount > 0) return true;
    return false;
  });

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Sessions
            <DocumentationLinkBadge href="/" />
          </UnstableCardTitle>
          <UnstableCardDescription>
            View agent session activity and arbiter decisions.
          </UnstableCardDescription>
          <UnstableCardAction>
            <Button variant="project">
              <DownloadIcon />
              Export Sessions
            </Button>
          </UnstableCardAction>
        </UnstableCardHeader>
        <div className="flex gap-2">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sessions by name..."
            />
          </InputGroup>
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <UnstableIconButton variant={isTableFiltered ? "org" : "outline"}>
                <FilterIcon />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="end">
              <UnstableDropdownMenuLabel>Filter by Decision</UnstableDropdownMenuLabel>
              {DECISION_STATUSES.map((status) => (
                <UnstableDropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter.includes(status)}
                  onClick={(e) => {
                    e.preventDefault();
                    handleStatusToggle(status);
                  }}
                >
                  {status}
                </UnstableDropdownMenuCheckboxItem>
              ))}
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </div>
        {sessions.length > 0 && !summariesReady ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-sm text-muted">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Generating session summaries...
            </div>
          </div>
        ) : !filteredSessions.length ? (
          <UnstableEmpty className="border">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>
                {isFiltered
                  ? "No sessions match the current filter"
                  : "No sessions have been recorded yet"}
              </UnstableEmptyTitle>
              <UnstableEmptyDescription>
                {isFiltered
                  ? "Adjust your search or filter criteria."
                  : "Sessions will appear here once agents begin processing."}
              </UnstableEmptyDescription>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <UnstableTable>
            <UnstableTableHeader>
              <UnstableTableRow>
                <UnstableTableHead className="w-5" />
                <UnstableTableHead className="w-1/4">Session</UnstableTableHead>
                <UnstableTableHead className="w-1/3" isTruncatable>
                  Description
                </UnstableTableHead>
                <UnstableTableHead>Decisions</UnstableTableHead>
                <UnstableTableHead>Duration</UnstableTableHead>
                <UnstableTableHead>Timestamp</UnstableTableHead>
                <UnstableTableHead className="w-10" />
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {filteredSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  summaries={summaries}
                  onReplay={setReplaySession}
                />
              ))}
            </UnstableTableBody>
          </UnstableTable>
        )}
      </UnstableCard>

      <SessionReplayModal
        isOpen={Boolean(replaySession)}
        onClose={() => setReplaySession(null)}
        logs={replaySession?.logs ?? []}
        sessionTitle={
          (replaySession && summaries?.[replaySession.id]?.summary) || replaySession?.title || ""
        }
      />
    </>
  );
};
