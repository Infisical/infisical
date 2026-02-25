import { useCallback, useState } from "react";
import {
  CheckCircle,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Clock,
  DownloadIcon,
  FilterIcon,
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

import { AGENTS, DEMO_EVENTS, type DemoEvent } from "../data";

type Session = {
  id: string;
  title: string;
  description: string;
  events: DemoEvent[];
  duration: number;
  approvedCount: number;
  deniedCount: number;
  createdAt: Date;
};

const agentNameMap = Object.fromEntries(AGENTS.map((a) => [a.id, a.name]));

const buildSessions = (): Session[] => {
  const involvedAgents = [...new Set(DEMO_EVENTS.map((e) => agentNameMap[e.agentId]))];
  const approvedCount = DEMO_EVENTS.filter((e) => e.status === "approved").length;
  const deniedCount = DEMO_EVENTS.filter((e) => e.status === "denied").length;
  const firstTs = DEMO_EVENTS[0]?.timestamp ?? 0;
  const lastTs = DEMO_EVENTS[DEMO_EVENTS.length - 1]?.timestamp ?? 0;

  return [
    {
      id: "session-1",
      title: "Billing Inquiry — Ticket #4021",
      description: `${involvedAgents.join(" → ")} flow`,
      events: DEMO_EVENTS,
      duration: lastTs - firstTs,
      approvedCount,
      deniedCount,
      createdAt: new Date("2026-02-25T14:32:00Z")
    }
  ];
};

const SESSIONS = buildSessions();

const DECISION_STATUSES = ["Approved", "Denied"] as const;

const SessionRow = ({ session }: { session: Session }) => {
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
          <span className="font-medium">{session.title}</span>
        </UnstableTableCell>
        <UnstableTableCell className={twMerge(isExpanded && "border-b-0")}>
          <span className="text-xs text-accent">{session.description}</span>
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
            {session.duration}s
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
      </UnstableTableRow>
      {isExpanded && (
        <UnstableTableRow>
          <UnstableTableCell colSpan={6} className="bg-card p-0">
            <div className="border-t-1 border-border p-6">
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute top-0 bottom-0 left-[15px] w-px bg-border" />
                <div className="flex flex-col gap-0">
                  {session.events.map((event, index) => (
                    <div key={event.id} className="relative flex items-start gap-4 pb-6 last:pb-0">
                      {/* Timeline node */}
                      <div className="relative z-10 ml-[5px] flex shrink-0 items-center justify-center">
                        {event.status === "approved" ? (
                          <CheckCircle className="size-5 bg-card text-success" />
                        ) : (
                          <XCircle className="size-5 bg-card text-danger" />
                        )}
                      </div>
                      {/* Event content */}
                      <div className="-mt-0.5 flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">{event.agentId}</span>
                          <span className="text-xs text-accent">{event.action}</span>
                          <span className="ml-auto font-mono text-xs text-muted">
                            {event.timestamp.toFixed(2)}s
                          </span>
                          <Badge
                            variant={event.status === "approved" ? "success" : "danger"}
                            className="text-[10px]"
                          >
                            {event.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-accent">{event.details}</p>
                        {event.reasoning && (
                          <div className="flex items-center gap-1 text-xs text-muted">
                            <Shield className="h-3 w-3 shrink-0" />
                            <span>&quot;{event.reasoning}&quot;</span>
                          </div>
                        )}
                        {event.targetAgentId && (
                          <div className="text-xs text-muted">
                            → Routed to{" "}
                            <span className="font-medium capitalize">{event.targetAgentId}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  const handleStatusToggle = useCallback(
    (status: string) =>
      setStatusFilter((prev) =>
        prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
      ),
    []
  );

  const isTableFiltered = statusFilter.length > 0;
  const isFiltered = search.length > 0 || statusFilter.length > 0;

  const filteredSessions = SESSIONS.filter((session) =>
    session.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
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
      {!filteredSessions.length ? (
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
              <UnstableTableHead>Session</UnstableTableHead>
              <UnstableTableHead>Description</UnstableTableHead>
              <UnstableTableHead>Decisions</UnstableTableHead>
              <UnstableTableHead>Duration</UnstableTableHead>
              <UnstableTableHead>Timestamp</UnstableTableHead>
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {filteredSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </UnstableTableBody>
        </UnstableTable>
      )}
    </UnstableCard>
  );
};
