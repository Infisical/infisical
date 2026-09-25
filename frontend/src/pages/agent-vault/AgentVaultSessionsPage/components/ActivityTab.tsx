import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { CirclePlusIcon, SearchIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Badge,
  Button,
  DateRangeFilter,
  type DateRangeFilterResult,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import {
  activityRecordKey,
  AgentVaultActivityDecision,
  AgentVaultSessionStatus,
  isRetryableActivityGap,
  useAgentVaultActivityTimeline,
  useGetAgentVaultSessionActivity
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultActivityGapReason,
  TAgentVaultActivityRecord,
  TAgentVaultSession
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { chunkIdTime, findRowShift } from "./ActivityTab.utils";

const ALL_PROXIES = "all";

const ARRIVAL_HOLD_MS = 1200;

const ArrivingRow = ({ arrivedAt, children }: { arrivedAt?: number; children: ReactNode }) => {
  const [isArriving, setIsArriving] = useState(false);

  useEffect(() => {
    if (arrivedAt === undefined) return undefined;
    const remaining = arrivedAt + ARRIVAL_HOLD_MS - Date.now();
    if (remaining <= 0) return undefined;
    setIsArriving(true);
    const timer = setTimeout(() => setIsArriving(false), remaining);
    return () => clearTimeout(timer);
  }, [arrivedAt]);

  return (
    <TableRow
      className={twMerge("transition-colors duration-700", isArriving && "bg-surface-active")}
    >
      {children}
    </TableRow>
  );
};

const FILTER_SEARCH_STEP = 5000;

const ACTIVITY_ROW_HEIGHT = 41;

type DecisionFilter = "all" | AgentVaultActivityDecision;

const DECISION_PRESENTATION: Record<
  AgentVaultActivityDecision,
  { label: string; variant: "success" | "neutral" | "warning" | "danger" }
> = {
  [AgentVaultActivityDecision.Brokered]: { label: "Brokered", variant: "success" },
  [AgentVaultActivityDecision.Passthrough]: { label: "Passthrough", variant: "neutral" },
  [AgentVaultActivityDecision.Blocked]: { label: "Blocked", variant: "warning" },
  [AgentVaultActivityDecision.Error]: { label: "Error", variant: "danger" }
};

const decisionPresentation = (decision: AgentVaultActivityDecision) =>
  DECISION_PRESENTATION[decision] ?? { label: decision || "Unknown", variant: "neutral" as const };

const GAP_EXPLANATION: Record<TAgentVaultActivityGapReason, string> = {
  repointed: "Stored in a bucket or prefix this project no longer uses",
  fetch: "Could not be read from the bucket",
  missing: "No longer in the bucket",
  refused: "The bucket refused the download",
  size: "The stored object is the wrong size",
  gcm: "Could not be decrypted",
  json: "The decrypted contents were not readable",
  mismatch: "Its records don't match the proxy and batch that sent them"
};

const statusTone = (status: number) => {
  if (status >= 500) return "text-danger";
  if (status >= 400) return "text-warning";
  if (status === 0) return "text-muted";
  return "text-foreground";
};

// A host pattern without a port means 443, and an IPv6 literal needs its brackets back.
const hostPatternFor = (record: TAgentVaultActivityRecord) => {
  const host = record.host.includes(":") ? `[${record.host}]` : record.host;
  return record.port === "443" ? host : `${host}:${record.port}`;
};

type Props = {
  session: TAgentVaultSession;
};

export const ActivityTab = ({ session }: Props) => {
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  // A session holds one bundle (AGENT_VAULT_MAX_SESSION_BUNDLES). Raising that cap needs a bundle
  // picker here: the rows offering Add Service matched no service, so they name no bundle.
  const accessBundle = session.accessBundles[0];
  const canAddService = isAdmin && Boolean(accessBundle?.id);
  const [serviceHost, setServiceHost] = useState<string | null>(null);
  const [addedHosts, setAddedHosts] = useState<Set<string>>(() => new Set());

  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [proxyFilter, setProxyFilter] = useState(ALL_PROXIES);
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);
  const [rangeKey, setRangeKey] = useState(0);
  const seenProxiesSessionId = useRef(session.id);

  const [isRangeOpen, setIsRangeOpen] = useState(true);
  const applyRange = (next: DateRangeFilterResult | null) => {
    setRange(next);
    setIsRangeOpen(!next || next.endDate.getTime() > Date.now());
  };
  useEffect(() => {
    if (!range || !isRangeOpen) return undefined;
    const remaining = range.endDate.getTime() - Date.now();
    if (remaining > 2 ** 31 - 1) return undefined;
    const timer = setTimeout(() => setIsRangeOpen(false), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [range, isRangeOpen]);

  const isActive = session.status === AgentVaultSessionStatus.Active;
  const liveScope = [session.id, range?.startDate.getTime(), range?.endDate.getTime()].join("|");
  const [budgetLatch, setBudgetLatch] = useState({ scope: liveScope, isOver: false });
  if (budgetLatch.scope !== liveScope) {
    setBudgetLatch({ scope: liveScope, isOver: false });
  }
  const isLivePausedForBudget = budgetLatch.scope === liveScope && budgetLatch.isOver;
  const isLive = isActive && isRangeOpen && !isLivePausedForBudget;
  const { history, arrived } = useGetAgentVaultSessionActivity(session.id, {
    isLive,
    from: range?.startDate,
    to: range?.endDate
  });
  const {
    data,
    isPending,
    isPlaceholderData,
    isError,
    isFetching,
    isRefetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError
  } = history;

  const pages = useMemo(() => {
    if (!data) return undefined;
    return arrived ? [arrived, ...data.pages] : data.pages;
  }, [data, arrived]);
  const { records, gaps, drops, arrivals, isTruncated, isOverByteBudget } =
    useAgentVaultActivityTimeline(pages);
  if (isOverByteBudget && !isPlaceholderData && !isLivePausedForBudget) {
    setBudgetLatch({ scope: liveScope, isOver: true });
  }
  const droppedTotal = drops.reduce((total, drop) => total + drop.droppedCount, 0);
  const isLoadError = isError && !data;

  const isEnabled = pages?.[0]?.enabled ?? false;
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);
  const storageUnavailable =
    data?.pages.find((page) => page.storageUnavailable)?.storageUnavailable ?? null;

  const seenProxies = useRef(new Map<string, string>());
  if (seenProxiesSessionId.current !== session.id) {
    seenProxies.current = new Map();
    seenProxiesSessionId.current = session.id;
  }
  (pages ?? []).forEach((page) =>
    page.chunks.forEach((chunk) => {
      if (!seenProxies.current.has(chunk.proxyId)) {
        seenProxies.current.set(chunk.proxyId, chunk.proxyName ?? chunk.proxyId);
      }
    })
  );
  const proxies = [...seenProxies.current.entries()].map(([id, name]) => ({ id, name }));

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      if (range) {
        const at = Date.parse(record.ts);
        if (at < range.startDate.getTime() || at > range.endDate.getTime()) return false;
      }
      if (decisionFilter !== "all" && record.decision !== decisionFilter) return false;
      if (proxyFilter !== ALL_PROXIES && record.proxyId !== proxyFilter) return false;
      if (!term) return true;
      return (
        record.host.toLowerCase().includes(term) ||
        record.path.toLowerCase().includes(term) ||
        record.method.toLowerCase().includes(term) ||
        (record.service ?? "").toLowerCase().includes(term)
      );
    });
  }, [records, search, decisionFilter, proxyFilter, range]);

  const hasBrowserFilter =
    Boolean(search.trim()) || decisionFilter !== "all" || proxyFilter !== ALL_PROXIES;
  const isFiltered = hasBrowserFilter || Boolean(range);

  const searched = useMemo(
    () =>
      (data?.pages ?? []).reduce(
        (total, page) => total + page.chunks.reduce((sum, chunk) => sum + chunk.recordCount, 0),
        0
      ),
    [data]
  );

  const filterKey = [
    search.trim(),
    decisionFilter,
    proxyFilter,
    range?.startDate.getTime(),
    range?.endDate.getTime()
  ].join("|");
  const [allowance, setAllowance] = useState({ filterKey, until: searched + FILTER_SEARCH_STEP });
  if (allowance.filterKey !== filterKey) {
    setAllowance({ filterKey, until: searched + FILTER_SEARCH_STEP });
  }
  const searchOlder = () => setAllowance({ filterKey, until: searched + FILTER_SEARCH_STEP });
  const isSearchPaused =
    hasBrowserFilter && Boolean(hasNextPage) && !isTruncated && searched >= allowance.until;

  const lastPage = data?.pages[data.pages.length - 1];
  const searchedBackTo = lastPage?.nextCursor ? chunkIdTime(lastPage.nextCursor) : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ACTIVITY_ROW_HEIGHT,
    overscan: 16
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const lastVisibleIndex = virtualRows.length ? virtualRows[virtualRows.length - 1].index : 0;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || isPlaceholderData || isTruncated || isSearchPaused)
      return;
    if (records.length > 0 && lastVisibleIndex >= visible.length - 30)
      fetchNextPage().catch(() => {});
  }, [
    lastVisibleIndex,
    visible.length,
    records.length,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    isTruncated,
    isSearchPaused,
    fetchNextPage
  ]);
  const columnCount = proxies.length > 1 ? 8 : 7;
  const overflows = rowVirtualizer.getTotalSize() > (rowVirtualizer.scrollRect?.height ?? Infinity);
  const shownBefore = useRef(visible);
  useLayoutEffect(() => {
    const before = shownBefore.current;
    shownBefore.current = visible;
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollTop === 0) return;
    const top = Math.floor(scroller.scrollTop / ACTIVITY_ROW_HEIGHT);
    const shift = findRowShift(before, visible, top);
    if (shift) scroller.scrollTop += shift * ACTIVITY_ROW_HEIGHT;
  }, [visible]);

  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const isOpening = (isPending || isPlaceholderData) && visible.length === 0;
  const isSearchFailed = isFiltered && isFetchNextPageError;
  const isStillSearching =
    isFiltered &&
    records.length > 0 &&
    Boolean(hasNextPage) &&
    !isSearchPaused &&
    !isTruncated &&
    !isSearchFailed;

  let noRecordsTitle: string;
  let noRecordsDescription: string;
  if (isOpening) {
    noRecordsTitle = "Loading requests";
    noRecordsDescription = "";
  } else if (isLoadError) {
    noRecordsTitle = "Failed to load activity";
    noRecordsDescription = "Something went wrong while loading this session's requests.";
  } else if (isSearchFailed) {
    noRecordsTitle = "Failed to search older requests";
    noRecordsDescription = "Something went wrong while loading older requests.";
  } else if (isStillSearching) {
    noRecordsTitle = "Searching older requests";
    noRecordsDescription = "";
  } else if (hasChunks && records.length === 0) {
    noRecordsTitle = "Activity unavailable";
    noRecordsDescription = "None of this session's activity could be loaded.";
  } else if (isSearchPaused && searchedBackTo) {
    noRecordsTitle = `No matching requests since ${format(searchedBackTo, "MMM d, h:mm a")}`;
    noRecordsDescription = "Older requests have not been searched yet.";
  } else if (range && (!hasChunks || !hasBrowserFilter)) {
    noRecordsTitle = "No activity in this range";
    noRecordsDescription = `This session recorded nothing between ${format(
      range.startDate,
      "MMM d, yyyy HH:mm"
    )} and ${format(range.endDate, "MMM d, yyyy HH:mm")}.`;
  } else if (isFiltered) {
    noRecordsTitle = "No requests match these filters";
    noRecordsDescription = "Try a different search term, outcome, proxy or time range.";
  } else {
    noRecordsTitle = isActive ? "Nothing recorded yet" : "No activity recorded";
    noRecordsDescription = isActive
      ? "Requests this session makes through a proxy will appear here shortly after."
      : "This session ended without making any requests through a proxy.";
  }

  const isUnreachable =
    gaps.length > 0 && records.length === 0 && gaps.every((gap) => gap.reason === "fetch");

  const retryButton = (
    <Button
      variant="outline"
      size="sm"
      isPending={isRefetching}
      onClick={() => refetch().catch(() => {})}
    >
      Retry
    </Button>
  );

  if (!isPending && !isPlaceholderData && !isLoadError && storageUnavailable) {
    const isConnectionUnusable = storageUnavailable.reason === "connection-unusable";
    let unreadableDescription = "This session's recorded requests aren't available. Ask an admin.";
    if (isAdmin) {
      unreadableDescription = isConnectionUnusable
        ? (storageUnavailable.message ??
          "Activity logging's AWS connection can't be used right now.")
        : "Activity logging has no AWS connection, so this session's recorded requests can't be loaded.";
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Activity can&apos;t be read</EmptyTitle>
          <EmptyDescription>{unreadableDescription}</EmptyDescription>
        </EmptyHeader>
        {isAdmin && (
          <div className="flex gap-2">
            {isConnectionUnusable && retryButton}
            <Button variant="av" asChild>
              <Link
                to="/organizations/$orgId/agent-vault/activity-logs"
                params={{ orgId: currentOrg.id }}
              >
                Go to Activity Logs
              </Link>
            </Button>
          </div>
        )}
      </Empty>
    );
  }

  if (!isPending && !isPlaceholderData && !isLoadError && !isEnabled && !hasChunks && !range) {
    const offDescription = isAdmin
      ? "Point Agent Vault at a bucket under Activity Logs to start recording what your agents reach."
      : "Ask an Agent Vault administrator to turn it on.";

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Activity logging is off</EmptyTitle>
          <EmptyDescription>{offDescription}</EmptyDescription>
        </EmptyHeader>
        {isAdmin && (
          <Button variant="av" asChild>
            <Link
              to="/organizations/$orgId/agent-vault/activity-logs"
              params={{ orgId: currentOrg.id }}
            >
              Go to Activity Logs
            </Link>
          </Button>
        )}
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-56 flex-1">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search host, path, method or service..."
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
        </div>
        <Select
          value={decisionFilter}
          onValueChange={(value) => setDecisionFilter(value as DecisionFilter)}
        >
          <SelectTrigger aria-label="Filter by outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value="all">All Outcomes</SelectItem>
            {Object.entries(DECISION_PRESENTATION).map(([value, presentation]) => (
              <SelectItem key={value} value={value}>
                {presentation.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangeFilter
          key={rangeKey}
          accent="av"
          className="h-9"
          isActive={Boolean(range)}
          onChange={(result) => applyRange(result)}
        />
        {range && (
          <IconButton
            variant="ghost"
            aria-label="Clear time range"
            onClick={() => {
              applyRange(null);
              setRangeKey((key) => key + 1);
            }}
          >
            <XIcon />
          </IconButton>
        )}
        <Select value={proxyFilter} onValueChange={setProxyFilter}>
          <SelectTrigger aria-label="Filter by proxy">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL_PROXIES}>All Proxies</SelectItem>
            {proxies.map((proxy) => (
              <SelectItem key={proxy.id} value={proxy.id}>
                {proxy.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isLive && (
          <span className="flex items-center gap-1.5 text-xs text-success">
            <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-current" />
            Live
          </span>
        )}
      </div>

      {isUnreachable && (
        <Alert variant="warning">
          <AlertDescription>
            <div className="flex flex-col gap-1">
              <p>
                None of this session&apos;s activity could be read from the bucket. The bucket has
                to allow requests from this origin.
              </p>
              {!isAdmin && (
                <p>Ask an Agent Vault administrator to check the bucket&apos;s CORS rule.</p>
              )}
            </div>
            <AlertAction className="flex gap-2">
              {retryButton}
              {isAdmin && (
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/organizations/$orgId/agent-vault/activity-logs"
                    params={{ orgId: currentOrg.id }}
                  >
                    Go to Activity Logs
                  </Link>
                </Button>
              )}
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      {!isUnreachable && gaps.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <div className="flex flex-col gap-1">
              {gaps.slice(0, 5).map((gap) => (
                <span key={gap.chunkId}>
                  {gap.recordCount} {gap.recordCount === 1 ? "request" : "requests"} from{" "}
                  {gap.proxyName ?? gap.proxyId} around{" "}
                  {format(new Date(gap.startedAt), "MMM d, h:mm a")} cannot be shown.{" "}
                  {GAP_EXPLANATION[gap.reason]}.
                </span>
              ))}
              {gaps.length > 5 && <span>and {gaps.length - 5} more.</span>}
            </div>
            {gaps.some((gap) => isRetryableActivityGap(gap.reason)) && (
              <AlertAction>{retryButton}</AlertAction>
            )}
          </AlertDescription>
        </Alert>
      )}

      {droppedTotal > 0 && (
        <div className="rounded-md border border-border bg-container px-3 py-2 text-xs text-muted">
          {droppedTotal.toLocaleString()} {droppedTotal === 1 ? "request was" : "requests were"} not
          recorded.
        </div>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            {(isOpening || isStillSearching) && <Spinner size="sm" />}
            <EmptyTitle>{noRecordsTitle}</EmptyTitle>
            {noRecordsDescription && <EmptyDescription>{noRecordsDescription}</EmptyDescription>}
          </EmptyHeader>
          {isSearchPaused && !isSearchFailed && (
            <Button variant="outline" size="sm" onClick={searchOlder}>
              Search older requests
            </Button>
          )}
          {isSearchFailed && (
            <Button
              variant="outline"
              size="sm"
              isPending={isFetchingNextPage}
              onClick={() => fetchNextPage().catch(() => {})}
            >
              Retry
            </Button>
          )}
          {isLoadError && (
            <Button
              variant="outline"
              size="sm"
              isPending={isFetching}
              onClick={() => refetch().catch(() => {})}
            >
              Retry
            </Button>
          )}
        </Empty>
      ) : (
        <Table
          ref={scrollRef}
          containerClassName="min-h-0 thin-scrollbar flex-1 overflow-auto [overflow-anchor:none]"
        >
          <TableHeader className="sticky top-0 z-10 bg-container">
            <TableRow>
              <TableHead>Time</TableHead>
              {proxies.length > 1 && <TableHead>Proxy</TableHead>}
              <TableHead>Method</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead variant="action" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {padTop > 0 && <tr style={{ height: padTop }} />}
            {virtualRows.map((virtualRow) => {
              const record = visible[virtualRow.index] as TAgentVaultActivityRecord;
              const presentation = decisionPresentation(record.decision);
              const isAddable =
                canAddService &&
                !record.service &&
                (record.decision === AgentVaultActivityDecision.Blocked ||
                  record.decision === AgentVaultActivityDecision.Passthrough) &&
                !addedHosts.has(hostPatternFor(record));
              const host = (
                <span className="flex w-fit items-center gap-2 text-sm">
                  <ServiceIcon hostPattern={record.host} />
                  {record.host}
                </span>
              );
              return (
                <ArrivingRow
                  key={activityRecordKey(record)}
                  arrivedAt={arrivals.get(activityRecordKey(record))}
                >
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono text-xs whitespace-nowrap">
                          {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss")}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss.SSS (zzz)")}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  {proxies.length > 1 && (
                    <TableCell className="text-xs text-muted">
                      {proxies.find((proxy) => proxy.id === record.proxyId)?.name ?? record.proxyId}
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs">{record.method}</TableCell>
                  <TableCell>
                    {record.service ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{host}</TooltipTrigger>
                        <TooltipContent>{record.service}</TooltipContent>
                      </Tooltip>
                    ) : (
                      host
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="block max-w-80 truncate font-mono text-xs" title={record.path}>
                      {record.path}
                    </span>
                  </TableCell>
                  <TableCell className={`font-mono text-xs ${statusTone(record.status)}`}>
                    {record.status || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={presentation.variant}>{presentation.label}</Badge>
                  </TableCell>
                  <TableCell variant="action">
                    {isAddable && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setServiceHost(hostPatternFor(record))}
                          >
                            <CirclePlusIcon />
                            Add Service
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Add {record.host} to {accessBundle.name}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </TableCell>
                </ArrivingRow>
              );
            })}
            {padBottom > 0 && <tr style={{ height: padBottom }} />}
            {(isFetchingNextPage || isSearchPaused || (!hasNextPage && overflows)) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="text-center text-xs text-muted">
                  {isFetchingNextPage && (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner size="xs" />
                      Loading more
                    </span>
                  )}
                  {!isFetchingNextPage && isSearchPaused && searchedBackTo && (
                    <span className="flex items-center justify-center gap-1">
                      Searched back to {format(searchedBackTo, "MMM d, h:mm a")} ·
                      <Button variant="link" size="xs" onClick={searchOlder}>
                        Search older requests
                      </Button>
                    </span>
                  )}
                  {!isFetchingNextPage && !isSearchPaused && "No more requests"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {isTruncated && (
        <p className="text-xs text-muted">
          Showing the most recent {records.length.toLocaleString()} requests. Pick a time range to
          see further back.
          {isActive && isRangeOpen && isLivePausedForBudget && " Live updates are paused."}
        </p>
      )}

      {canAddService && accessBundle.id && (
        <ServiceSheet
          isOpen={Boolean(serviceHost)}
          onOpenChange={(open) => !open && setServiceHost(null)}
          accessBundleId={accessBundle.id}
          prefillHost={serviceHost ?? undefined}
          onSaved={() => {
            if (serviceHost) setAddedHosts((prev) => new Set(prev).add(serviceHost));
          }}
        />
      )}
    </div>
  );
};
