import { useMemo, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import {
  ActivityIcon,
  BotIcon,
  CircleSlashIcon,
  FlaskConicalIcon,
  KeyIcon,
  LockIcon,
  LucideIcon,
  RefreshCwIcon,
  SearchIcon,
  TriangleAlertIcon,
  UserIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableHeadLabel,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionAuditLogsActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { usePopUp } from "@app/hooks";
import { PolicyRuleMethod, TAgentPolicy, useGetAgentPolicies } from "@app/hooks/api/agentPolicies";
import { useGetAgentSessions } from "@app/hooks/api/agentSessions";
import { EventType } from "@app/hooks/api/auditLogs/enums";
import { useGetAuditLogs } from "@app/hooks/api/auditLogs/queries";
import { AgentProxyDecision, AuditLog } from "@app/hooks/api/auditLogs/types";
import { useGetWorkspaceUsers } from "@app/hooks/api/projects/queries";
import { TUserPolicy, useGetUserPolicies } from "@app/hooks/api/userPolicies";

import { PolicySimulationModal } from "./PolicySimulationModal";

const LIVE_REFETCH_MS = 3000;
const PAGE_SIZE = 50;

const WINDOWS = [
  { key: "1h", label: "Last hour", hours: 1 },
  { key: "24h", label: "Last 24 hours", hours: 24 },
  { key: "7d", label: "Last 7 days", hours: 24 * 7 }
] as const;

type TWindowKey = (typeof WINDOWS)[number]["key"];

// The same icon a decision carries in its tile above, so a row and the counter it belongs to read as
// one thing.
const DECISION_META: Record<
  AgentProxyDecision,
  {
    label: string;
    badge: "success" | "danger" | "neutral" | "warning";
    icon: LucideIcon;
    hint: string;
  }
> = {
  [AgentProxyDecision.Brokered]: {
    label: "Brokered",
    badge: "success",
    icon: KeyIcon,
    hint: "Both gates matched, so the policy's credential went on the request."
  },
  [AgentProxyDecision.Blocked]: {
    label: "Blocked",
    badge: "danger",
    icon: CircleSlashIcon,
    hint: "The proxy answered 403 and no credential was attached."
  },
  [AgentProxyDecision.Passthrough]: {
    label: "Passed through",
    badge: "neutral",
    icon: ActivityIcon,
    hint: "An allowlisted host, forwarded without a credential."
  },
  [AgentProxyDecision.Error]: {
    label: "Error",
    badge: "warning",
    icon: TriangleAlertIcon,
    hint: "The proxy could not complete the request upstream."
  }
};

type TActivityEvent = {
  id: string;
  createdAt: string;
  identityId: string;
  agentName: string;
  userId: string;
  decision: AgentProxyDecision;
  method: string;
  host: string;
  port: number;
  path: string;
  statusCode?: number;
  policyName?: string;
  userPolicyName?: string;
  reason?: string;
};

const toActivityEvent = (log: AuditLog): TActivityEvent | null => {
  if (log.event.type !== EventType.AGENT_PROXY_REQUEST) return null;
  return { id: log.id, createdAt: log.createdAt, ...log.event.metadata };
};

// 443 and 80 are the only ports the proxy can have reached over their default scheme, so anything else
// is shown with its port rather than guessed at.
const eventUrl = ({ host, port, path }: TActivityEvent) => {
  const scheme = port === 80 ? "http" : "https";
  const authority = port === 80 || port === 443 ? host : `${host}:${port}`;
  return `${scheme}://${authority}${path}`;
};

// Both halves of the intersection, since a request is only brokered when each side matched. An empty
// side is exactly why the request was turned away, so it is named rather than left blank.
const PolicyPair = ({ event }: { event: TActivityEvent }) => {
  if (event.decision === AgentProxyDecision.Passthrough) {
    return <span className="text-xs text-muted">Allowlisted host</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {[
        { key: "agent", icon: BotIcon, name: event.policyName, missing: "no agent policy" },
        { key: "user", icon: UserIcon, name: event.userPolicyName, missing: "no user policy" }
      ].map(({ key, icon: Icon, name, missing }) => (
        <span key={key} className="flex min-w-0 items-center gap-1.5 text-xs">
          <Icon className={cn("size-3 shrink-0", name ? "text-label" : "text-muted")} />
          <span
            className={cn("truncate", name ? "text-foreground" : "text-muted")}
            title={name || missing}
          >
            {name || missing}
          </span>
        </span>
      ))}
    </div>
  );
};

const StatTile = ({
  label,
  count,
  icon: Icon,
  accent,
  isActive,
  onClick
}: {
  label: string;
  count: number;
  icon: LucideIcon;
  accent: string;
  isActive: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-1 cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
      isActive ? "border-foreground/20 bg-container/60" : "border-border hover:bg-container/40"
    )}
  >
    {/* Nudged to sit on the count's cap height: a 16px icon against an 18px line. */}
    <Icon className={cn("mt-0.5 size-4 shrink-0", accent)} />
    <div className="min-w-0">
      <p className="text-lg leading-none text-foreground">{count}</p>
      <p className="mt-1 truncate text-xs text-label">{label}</p>
    </div>
  </button>
);

export const ActivityTab = () => {
  const { projectId, currentProject } = useProject();
  const navigate = useNavigate();
  const { permission } = useProjectPermission();
  const canReadAuditLogs = permission.can(
    ProjectPermissionAuditLogsActions.Read,
    ProjectPermissionSub.AuditLogs
  );

  // Set when the feed was opened from a session, so the whole tab narrows to that one agent run.
  const sessionId = useSearch({
    from: ROUTE_PATHS.SecretManager.AgentProxyPage.id,
    select: (searchParams) => searchParams.sessionId
  });

  const [isLive, setIsLive] = useState(true);
  const [windowKey, setWindowKey] = useState<TWindowKey>("24h");
  const [decision, setDecision] = useState<AgentProxyDecision | null>(null);
  const [search, setSearch] = useState("");

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["testRequest"] as const);

  // The window is anchored when it is chosen rather than recomputed per render: a moving date would
  // change the query key on every tick and refetch from scratch instead of polling.
  const [anchoredAt, setAnchoredAt] = useState(() => Date.now());
  const { startDate, endDate } = useMemo(() => {
    const hours = WINDOWS.find((entry) => entry.key === windowKey)?.hours ?? 24;
    return {
      startDate: new Date(anchoredAt - hours * 60 * 60 * 1000),
      // Ahead of now, so events recorded while the tab is open still fall inside the window.
      endDate: new Date(anchoredAt + 24 * 60 * 60 * 1000)
    };
  }, [windowKey, anchoredAt]);

  const { data, isPending, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage, refetch } =
    useGetAuditLogs(
      {
        eventType: [EventType.AGENT_PROXY_REQUEST],
        // Narrowed by the API rather than in the browser, so the counts and "load more" describe the
        // session rather than whatever happened to be on the loaded page.
        ...(sessionId ? { eventMetadata: { sessionId } } : {}),
        startDate,
        endDate,
        limit: PAGE_SIZE
      },
      projectId,
      { enabled: canReadAuditLogs, refetchInterval: isLive ? LIVE_REFETCH_MS : undefined }
    );

  const { data: agentPolicies } = useGetAgentPolicies(projectId);
  const { data: userPolicies } = useGetUserPolicies(projectId);
  const { data: projectUsers } = useGetWorkspaceUsers(projectId, true);
  const { data: sessions } = useGetAgentSessions(projectId, { enabled: Boolean(sessionId) });
  const session = sessions?.find((entry) => entry.id === sessionId);

  const clearSessionFilter = () =>
    navigate({
      to: ROUTE_PATHS.SecretManager.AgentProxyPage.path,
      params: { orgId: currentProject.orgId, projectId: currentProject.id },
      search: { selectedTab: "activity" }
    });

  const events = useMemo(
    () => (data?.pages ?? []).flat().flatMap((log) => toActivityEvent(log) ?? []),
    [data]
  );

  // The shared audit log hook offers a next page whenever the last one came back non-empty, so a short
  // final page would otherwise leave a button that fetches nothing.
  const hasMorePages = hasNextPage && (data?.pages.at(-1)?.length ?? 0) >= PAGE_SIZE;

  const counts = useMemo(
    () =>
      events.reduce(
        (acc, event) => ({ ...acc, [event.decision]: (acc[event.decision] ?? 0) + 1 }),
        {} as Partial<Record<AgentProxyDecision, number>>
      ),
    [events]
  );

  // Filtered in the browser rather than by the API: the decision counts above describe the loaded
  // window, and they would contradict the rows if the server had already dropped the other decisions.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((event) => {
      if (decision && event.decision !== decision) return false;
      if (!term) return true;
      return `${event.method} ${event.host}${event.path} ${event.agentName} ${event.policyName ?? ""}`
        .toLowerCase()
        .includes(term);
    });
  }, [events, decision, search]);

  const userById = useMemo(
    () => new Map((projectUsers ?? []).map((member) => [member.user.id, member.user])),
    [projectUsers]
  );

  const describeUser = (userId: string) => {
    const user = userById.get(userId);
    if (!user) return "Unknown user";
    return user.email || user.username;
  };

  // The two policies the request was actually judged against, so the simulation opens on the same pair
  // the proxy used. The policy name only survives on the agent side, and only when a rule matched.
  const resolvePolicies = (event: TActivityEvent) => {
    const covering = (agentPolicies ?? []).filter((policy) =>
      policy.agents.some((agent) => agent.identityId === event.identityId)
    );
    const agentPolicy =
      covering.find((policy) => policy.name === event.policyName) ?? covering[0] ?? undefined;
    const userPolicy = (userPolicies ?? []).find((policy) =>
      policy.users.some((user) => user.userId === event.userId)
    );
    return { agentPolicy, userPolicy };
  };

  const handleTestRequest = (event: TActivityEvent) => {
    const { agentPolicy, userPolicy } = resolvePolicies(event);
    handlePopUpOpen("testRequest", {
      agentPolicy,
      userPolicy,
      initialRequest: {
        method: event.method.toUpperCase() as PolicyRuleMethod,
        url: eventUrl(event)
      }
    });
  };

  const testRequestData = popUp.testRequest.data as
    | {
        agentPolicy?: TAgentPolicy;
        userPolicy?: TUserPolicy;
        initialRequest: { method: PolicyRuleMethod; url: string };
      }
    | undefined;

  if (!canReadAuditLogs) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
          <CardDescription>Every request the proxy handled, and how it decided.</CardDescription>
        </CardHeader>
        <CardContent>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LockIcon />
              </EmptyMedia>
              <EmptyTitle>Audit log access required</EmptyTitle>
              <EmptyDescription>
                Proxy activity is read from this project&apos;s audit log. Ask an admin for audit
                log access to see it.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Every request the proxy handled, with the gate that decided it.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="agent-proxy-activity-live"
                variant="success"
                size="sm"
                checked={isLive}
                onCheckedChange={setIsLive}
              />
              <Label htmlFor="agent-proxy-activity-live" className="flex items-center gap-1.5">
                {isLive && (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                )}
                Live
              </Label>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="Refresh activity"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    // Re-anchoring the window is what actually pulls in anything older than the
                    // current one; the refetch alone would return the same page.
                    setAnchoredAt(Date.now());
                    refetch();
                  }}
                >
                  <RefreshCwIcon className={cn(isFetching && "animate-spin")} />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {sessionId && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-container/50 px-3 py-2">
            <BotIcon className="size-3.5 shrink-0 text-label" />
            <span className="min-w-0 truncate text-sm text-foreground">
              {session
                ? `${session.agentName} acting for ${session.userEmail ?? session.username}`
                : "One session"}
            </span>
            <span className="text-xs text-muted">
              Showing this session only. Counts below cover it alone.
            </span>
            <Button variant="ghost" size="xs" className="ml-auto" onClick={clearSessionFilter}>
              <XIcon />
              Show all activity
            </Button>
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          <StatTile
            label="Brokered"
            count={counts[AgentProxyDecision.Brokered] ?? 0}
            icon={KeyIcon}
            accent="text-success"
            isActive={decision === AgentProxyDecision.Brokered}
            onClick={() =>
              setDecision(
                decision === AgentProxyDecision.Brokered ? null : AgentProxyDecision.Brokered
              )
            }
          />
          <StatTile
            label="Blocked"
            count={counts[AgentProxyDecision.Blocked] ?? 0}
            icon={CircleSlashIcon}
            accent="text-danger"
            isActive={decision === AgentProxyDecision.Blocked}
            onClick={() =>
              setDecision(
                decision === AgentProxyDecision.Blocked ? null : AgentProxyDecision.Blocked
              )
            }
          />
          <StatTile
            label="Passed through"
            count={counts[AgentProxyDecision.Passthrough] ?? 0}
            icon={ActivityIcon}
            accent="text-muted"
            isActive={decision === AgentProxyDecision.Passthrough}
            onClick={() =>
              setDecision(
                decision === AgentProxyDecision.Passthrough ? null : AgentProxyDecision.Passthrough
              )
            }
          />
          <StatTile
            label="Errors"
            count={counts[AgentProxyDecision.Error] ?? 0}
            icon={TriangleAlertIcon}
            accent="text-warning"
            isActive={decision === AgentProxyDecision.Error}
            onClick={() =>
              setDecision(decision === AgentProxyDecision.Error ? null : AgentProxyDecision.Error)
            }
          />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <InputGroup className="min-w-56 flex-1">
            <InputGroupAddon align="inline-start">
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by host, path, agent or policy..."
            />
          </InputGroup>
          <Select
            value={windowKey}
            onValueChange={(value) => {
              setWindowKey(value as TWindowKey);
              setAnchoredAt(Date.now());
            }}
          >
            <SelectTrigger className="w-40 shrink-0" aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {WINDOWS.map((entry) => (
                <SelectItem value={entry.key} key={entry.key}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isPending && !filtered.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {events.length ? <SearchIcon /> : <ActivityIcon />}
              </EmptyMedia>
              <EmptyTitle>
                {(() => {
                  if (events.length) return "No requests match your filters";
                  return sessionId
                    ? "This session has not made a request yet"
                    : "No proxy activity yet";
                })()}
              </EmptyTitle>
              {!events.length && (
                <EmptyDescription>
                  {sessionId
                    ? "It was started on the agent's behalf, but nothing has come through the proxy on it."
                    : "Start an agent through the proxy and every request it makes lands here, brokered or blocked."}
                </EmptyDescription>
              )}
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className="min-w-[64rem] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">
                  <TableHeadLabel>Time</TableHeadLabel>
                </TableHead>
                <TableHead className="w-36">
                  <TableHeadLabel>Decision</TableHeadLabel>
                </TableHead>
                <TableHead>
                  <TableHeadLabel>Request</TableHeadLabel>
                </TableHead>
                <TableHead className="w-48">
                  <TableHeadLabel>Policies</TableHeadLabel>
                </TableHead>
                {/* Every row would repeat the session the banner already names. */}
                {!sessionId && (
                  <TableHead className="w-56">
                    <TableHeadLabel>Session</TableHeadLabel>
                  </TableHead>
                )}
                <TableHead className="w-16">
                  <TableHeadLabel>Status</TableHeadLabel>
                </TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending &&
                ["first", "second", "third", "fourth", "fifth"].map((row) => (
                  <TableRow className="!h-16" key={`activity-skeleton-${row}`}>
                    {["time", "decision", "request", "policy", "session", "status", "action"]
                      .filter((cell) => cell !== "session" || !sessionId)
                      .map((cell) => (
                        <TableCell key={`activity-skeleton-${row}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
              {filtered.map((event) => {
                const meta = DECISION_META[event.decision];
                return (
                  <TableRow key={event.id} className="h-12">
                    <TableCell className="text-muted">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="tabular-nums">
                            {formatDateTime({
                              timestamp: event.createdAt,
                              timezone: Timezone.Local,
                              dateFormat: "MMM d, HH:mm:ss"
                            })}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Badge variant={meta.badge} iconPosition="left">
                              <meta.icon />
                              {meta.label}
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{meta.hint}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge variant="neutral" className="shrink-0">
                          {event.method}
                        </Badge>
                        {/* The reason belongs under the URL it explains, so the method badge centres
                            against the pair rather than sitting above a left-aligned second line. */}
                        <div className="min-w-0">
                          <span
                            className="block truncate font-mono text-xs text-foreground"
                            title={`${event.host}${event.path}`}
                          >
                            {event.host}
                            <span className="text-muted">{event.path}</span>
                          </span>
                          {event.reason && (
                            <p className="mt-0.5 truncate text-xs text-danger" title={event.reason}>
                              {event.reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <PolicyPair event={event} />
                    </TableCell>
                    {!sessionId && (
                      <TableCell>
                        <p className="truncate text-sm text-foreground" title={event.agentName}>
                          {event.agentName}
                        </p>
                        <p className="truncate text-xs text-muted">
                          for {describeUser(event.userId)}
                        </p>
                      </TableCell>
                    )}
                    <TableCell
                      className={cn(
                        "text-sm",
                        event.statusCode && event.statusCode >= 400 ? "text-danger" : "text-muted"
                      )}
                    >
                      {event.statusCode ?? "—"}
                    </TableCell>
                    <TableCell className="w-12">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <IconButton
                            aria-label="Test this request"
                            variant="ghost"
                            size="xs"
                            onClick={() => handleTestRequest(event)}
                          >
                            <FlaskConicalIcon />
                          </IconButton>
                        </TooltipTrigger>
                        <TooltipContent>Replay against the policies</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {hasMorePages && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              isPending={isFetchingNextPage}
              onClick={() => fetchNextPage()}
            >
              Load more
            </Button>
          </div>
        )}

        <PolicySimulationModal
          isOpen={popUp.testRequest.isOpen}
          agentPolicy={testRequestData?.agentPolicy}
          userPolicy={testRequestData?.userPolicy}
          initialRequest={testRequestData?.initialRequest}
          onOpenChange={(isOpen) => handlePopUpToggle("testRequest", isOpen)}
        />
      </CardContent>
    </Card>
  );
};
