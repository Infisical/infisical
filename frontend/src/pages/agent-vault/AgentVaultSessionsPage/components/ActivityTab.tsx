import { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  CircleHelpIcon,
  CircleXIcon,
  KeyRoundIcon,
  type LucideIcon,
  PlusIcon,
  SearchIcon,
  ShieldBanIcon,
  TriangleAlertIcon,
  XIcon
} from "lucide-react";
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
  AGENT_VAULT_ACTIVITY_LIVE_POLL_MS,
  AgentVaultActivityDecision,
  AgentVaultSessionStatus,
  useAgentVaultActivityTimeline,
  useGetAgentVaultSessionActivity
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultActivityGapReason,
  TAgentVaultActivityRecord,
  TAgentVaultSession
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { chunkIdTime, findRowShift, groupActivityGaps, httpStatusLabel } from "./ActivityTab.utils";
import { LiveState, LiveStateBadge, LiveStatusRow } from "./LiveStatusRow";

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
  { label: string; variant: "success" | "neutral" | "warning" | "danger"; icon: LucideIcon }
> = {
  [AgentVaultActivityDecision.Brokered]: {
    label: "Brokered",
    variant: "success",
    icon: KeyRoundIcon
  },
  [AgentVaultActivityDecision.Passthrough]: {
    label: "Passthrough",
    variant: "neutral",
    icon: ArrowRightIcon
  },
  [AgentVaultActivityDecision.Blocked]: {
    label: "Blocked",
    variant: "warning",
    icon: ShieldBanIcon
  },
  [AgentVaultActivityDecision.Error]: { label: "Error", variant: "danger", icon: CircleXIcon }
};

const decisionPresentation = (decision: AgentVaultActivityDecision) =>
  DECISION_PRESENTATION[decision] ?? {
    label: decision || "Unknown",
    variant: "neutral" as const,
    icon: CircleHelpIcon
  };

const GAP_EXPLANATION: Record<TAgentVaultActivityGapReason, { one: string; many: string }> = {
  repointed: {
    one: "is stored in a bucket this project no longer uses",
    many: "are stored in a bucket this project no longer uses"
  },
  fetch: { one: "could not be read from the bucket", many: "could not be read from the bucket" },
  missing: { one: "is no longer in the bucket", many: "are no longer in the bucket" },
  refused: { one: "was refused by the bucket", many: "were refused by the bucket" },
  size: { one: "is stored at the wrong size", many: "are stored at the wrong size" },
  altered: {
    one: "was changed after it was uploaded",
    many: "were changed after they were uploaded"
  },
  gcm: { one: "could not be decrypted", many: "could not be decrypted" },
  json: {
    one: "was decrypted but could not be read",
    many: "were decrypted but could not be read"
  },
  mismatch: {
    one: "doesn't match the proxy and batch that sent it",
    many: "don't match the proxy and batch that sent them"
  }
};

const statusTone = (status: number) => {
  if (status >= 500) return "text-danger";
  if (status >= 400) return "text-warning";
  return "text-foreground";
};

// Agent Vault answers Blocked and Error requests itself, so their status is its own reply, not the
// upstream's.
const isProxyAnswered = (decision: AgentVaultActivityDecision) =>
  decision === AgentVaultActivityDecision.Blocked || decision === AgentVaultActivityDecision.Error;

const proxyAnswerDescription = (record: TAgentVaultActivityRecord) => {
  const answer = `Agent Vault returned ${httpStatusLabel(record.status)}`;
  return record.decision === AgentVaultActivityDecision.Blocked
    ? `${answer} without sending this request to ${record.host}`
    : `${answer} with no response from ${record.host}`;
};

// A host pattern without a port means 443, and an IPv6 literal needs its brackets back.
const hostPatternFor = (record: TAgentVaultActivityRecord) => {
  const host = record.host.includes(":") ? `[${record.host}]` : record.host;
  return record.port === "443" ? host : `${host}:${record.port}`;
};

// A proxy uploads what it still holds on its next flush, up to a minute after the session ends, so
// the view keeps checking for new requests a while longer.
const SESSION_END_TAIL_MS = 2 * 60_000;

const endTailDeadline = (session: TAgentVaultSession) => {
  const endedAt =
    session.revokedAt ??
    (session.status === AgentVaultSessionStatus.Expired ? session.expiresAt : null);
  return endedAt ? new Date(endedAt).getTime() + SESSION_END_TAIL_MS : null;
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
  // Not cleared on close: a prefilled host drops the sheet's template step, so clearing the host
  // while the sheet animates out would change the step on screen.
  const [serviceHost, setServiceHost] = useState<string | null>(null);
  const [isServiceSheetOpen, setIsServiceSheetOpen] = useState(false);
  const [addedHosts, setAddedHosts] = useState<Set<string>>(() => new Set());

  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [proxyFilter, setProxyFilter] = useState(ALL_PROXIES);
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);
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
  const tailEndsAt = endTailDeadline(session);
  const [endTail, setEndTail] = useState(() => ({
    endsAt: tailEndsAt,
    isOpen: tailEndsAt !== null && tailEndsAt > Date.now()
  }));
  if (endTail.endsAt !== tailEndsAt) {
    setEndTail({ endsAt: tailEndsAt, isOpen: tailEndsAt !== null && tailEndsAt > Date.now() });
  }
  useEffect(() => {
    const { endsAt, isOpen } = endTail;
    if (endsAt === null || !isOpen) return undefined;
    const timer = setTimeout(
      () => setEndTail({ endsAt, isOpen: false }),
      Math.max(endsAt - Date.now(), 0)
    );
    return () => clearTimeout(timer);
  }, [endTail]);
  const isTailingEnd = endTail.endsAt === tailEndsAt && endTail.isOpen;

  const liveScope = [session.id, range?.startDate.getTime(), range?.endDate.getTime()].join("|");
  const [budgetLatch, setBudgetLatch] = useState({ scope: liveScope, isOver: false });
  if (budgetLatch.scope !== liveScope) {
    setBudgetLatch({ scope: liveScope, isOver: false });
  }
  const isLivePausedForBudget = budgetLatch.scope === liveScope && budgetLatch.isOver;
  const canTail = (isActive || isTailingEnd) && isRangeOpen;
  const isLive = canTail && !isLivePausedForBudget;
  const { history, live, arrived } = useGetAgentVaultSessionActivity(session.id, {
    isLive,
    from: range?.startDate,
    to: range?.endDate
  });
  let liveState: LiveState | null = null;
  if (canTail && isLivePausedForBudget) liveState = "paused";
  else if (isLive && live.isError) liveState = "reconnecting";
  else if (isLive && !isActive) liveState = "ended";
  else if (isLive) liveState = "live";
  const retryLive = () => live.refetch().catch(() => {});
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
  const { records, gaps, arrivals, isTruncated, isOverByteBudget } =
    useAgentVaultActivityTimeline(pages);
  if (isOverByteBudget && !isPlaceholderData && !isLivePausedForBudget) {
    setBudgetLatch({ scope: liveScope, isOver: true });
  }
  const isLoadError = isError && !data;

  const isEnabled = pages?.[0]?.activity.enabled ?? false;
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);
  const storageUnavailable =
    data?.pages.find((page) => page.activity.storageUnavailable)?.activity.storageUnavailable ??
    null;

  const seenProxies = useRef(new Map<string, string>());
  if (seenProxiesSessionId.current !== session.id) {
    seenProxies.current = new Map();
    seenProxiesSessionId.current = session.id;
  }
  (pages ?? []).forEach((page) =>
    page.chunks.forEach((chunk) => {
      if (!seenProxies.current.has(chunk.proxyId)) {
        seenProxies.current.set(chunk.proxyId, chunk.proxyName);
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
  const oldestChunkId = lastPage?.nextCursor ? lastPage.chunks.at(-1)?.chunkId : undefined;
  const searchedBackTo = oldestChunkId ? chunkIdTime(oldestChunkId) : null;

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
  const newRequestsKey = `${session.id}|${filterKey}`;
  const [newRequests, setNewRequests] = useState({ key: newRequestsKey, count: 0 });
  if (newRequests.key !== newRequestsKey) {
    setNewRequests({ key: newRequestsKey, count: 0 });
  }

  const shownBefore = useRef(visible);
  // Only arrivals stamped since the last change count, so rows a filter change reveals aren't new.
  const countedAt = useRef(Date.now());
  useLayoutEffect(() => {
    const before = shownBefore.current;
    shownBefore.current = visible;
    const since = countedAt.current;
    countedAt.current = Date.now();
    const scroller = scrollRef.current;
    if (!scroller || scroller.scrollTop === 0) return;
    const top = Math.floor(scroller.scrollTop / ACTIVITY_ROW_HEIGHT);
    const shift = findRowShift(before, visible, top);
    if (!shift) return;
    scroller.scrollTop += shift * ACTIVITY_ROW_HEIGHT;
    if (shift < 0) return;
    const landedAbove = visible.slice(0, top + shift).filter((record) => {
      const key = activityRecordKey(record);
      return (arrivals.get(key) ?? 0) > since;
    }).length;
    if (landedAbove) setNewRequests((prev) => ({ ...prev, count: prev.count + landedAbove }));
  }, [visible, arrivals]);

  const hasNewRequests = newRequests.count > 0;
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !hasNewRequests) return undefined;
    const clearAtTop = () => {
      if (scroller.scrollTop < 1) setNewRequests((prev) => ({ ...prev, count: 0 }));
    };
    scroller.addEventListener("scroll", clearAtTop, { passive: true });
    return () => scroller.removeEventListener("scroll", clearAtTop);
  }, [hasNewRequests]);
  const showNewRequests = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    setNewRequests((prev) => ({ ...prev, count: 0 }));
  };

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
  let noRecordsLiveState: LiveState | null = null;
  if (isOpening) {
    noRecordsTitle = "Loading requests";
    noRecordsDescription = "";
  } else if (isLoadError) {
    noRecordsTitle = "Failed to load session logs";
    noRecordsDescription = "Something went wrong while loading this session's requests.";
  } else if (isSearchFailed) {
    noRecordsTitle = "Failed to search older requests";
    noRecordsDescription = "Something went wrong while loading older requests.";
  } else if (isStillSearching) {
    noRecordsTitle = "Searching older requests";
    noRecordsDescription = "";
  } else if (hasChunks && records.length === 0) {
    noRecordsTitle = "Session logs unavailable";
    noRecordsDescription = "None of this session's logs could be loaded.";
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
  } else if (liveState === "live") {
    noRecordsLiveState = liveState;
    noRecordsTitle = "Waiting for requests";
    noRecordsDescription = "Requests made through a proxy show up here within about a minute.";
  } else if (liveState === "reconnecting") {
    noRecordsLiveState = liveState;
    noRecordsTitle = "Couldn't check for new requests";
    noRecordsDescription = `Trying again every ${AGENT_VAULT_ACTIVITY_LIVE_POLL_MS / 1000} seconds.`;
  } else if (liveState === "ended") {
    noRecordsLiveState = liveState;
    noRecordsTitle = "Nothing recorded yet";
    noRecordsDescription = "Its last requests can take up to a minute to show up.";
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
      Reload
    </Button>
  );

  if (!isPending && !isPlaceholderData && !isLoadError && storageUnavailable) {
    const isConnectionUnusable = storageUnavailable.reason === "connection-unusable";
    let unreadableDescription = "This session's recorded requests aren't available. Ask an admin.";
    if (isAdmin) {
      unreadableDescription = isConnectionUnusable
        ? (storageUnavailable.message ??
          "Session logging's AWS connection can't be used right now.")
        : "Session logging has no AWS connection, so this session's recorded requests can't be loaded.";
    }

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Session logs can&apos;t be read</EmptyTitle>
          <EmptyDescription>{unreadableDescription}</EmptyDescription>
        </EmptyHeader>
        {isAdmin && (
          <div className="flex gap-2">
            {isConnectionUnusable && retryButton}
            <Button variant="av" asChild>
              <Link
                to="/organizations/$orgId/agent-vault/settings"
                params={{ orgId: currentOrg.id }}
              >
                Go to Settings
              </Link>
            </Button>
          </div>
        )}
      </Empty>
    );
  }

  if (!isPending && !isPlaceholderData && !isLoadError && !isEnabled && !hasChunks && !range) {
    const offDescription = isAdmin
      ? "Point Agent Vault at a bucket under Settings to start recording what your agents reach."
      : "Ask an Agent Vault administrator to turn it on.";

    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Session logging is off</EmptyTitle>
          <EmptyDescription>{offDescription}</EmptyDescription>
        </EmptyHeader>
        {isAdmin && (
          <Button variant="av" asChild>
            <Link to="/organizations/$orgId/agent-vault/settings" params={{ orgId: currentOrg.id }}>
              Go to Settings
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
          accent="av"
          className="h-9"
          isActive={Boolean(range)}
          inactiveLabel="Entire Session"
          showTimezoneToggle={false}
          onChange={(result) => applyRange(result)}
          onClear={() => applyRange(null)}
        />
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
      </div>

      {isUnreachable && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <div className="flex flex-col gap-1">
              <p>
                None of this session&apos;s logs could be read from the bucket. The bucket has to
                allow requests from this origin.
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
                    to="/organizations/$orgId/agent-vault/settings"
                    params={{ orgId: currentOrg.id }}
                  >
                    Go to Settings
                  </Link>
                </Button>
              )}
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      {!isUnreachable && gaps.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <div className="flex flex-col gap-1">
              {groupActivityGaps(gaps).map(({ reason, recordCount }) => (
                <span key={reason}>
                  {recordCount.toLocaleString()} {recordCount === 1 ? "request" : "requests"}{" "}
                  {GAP_EXPLANATION[reason][recordCount === 1 ? "one" : "many"]}.
                </span>
              ))}
            </div>
            {gaps.some((gap) => gap.reason === "fetch" || gap.reason === "refused") && (
              <AlertAction>{retryButton}</AlertAction>
            )}
          </AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            {(isOpening || isStillSearching) && <Spinner size="sm" />}
            {noRecordsLiveState && <LiveStateBadge state={noRecordsLiveState} />}
            <EmptyTitle>{noRecordsTitle}</EmptyTitle>
            {noRecordsDescription && <EmptyDescription>{noRecordsDescription}</EmptyDescription>}
          </EmptyHeader>
          {noRecordsLiveState === "reconnecting" && (
            <Button variant="outline" size="sm" isPending={live.isFetching} onClick={retryLive}>
              Check Now
            </Button>
          )}
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
              Search Again
            </Button>
          )}
          {isLoadError && (
            <Button
              variant="outline"
              size="sm"
              isPending={isFetching}
              onClick={() => refetch().catch(() => {})}
            >
              Reload
            </Button>
          )}
        </Empty>
      ) : (
        <Table
          ref={scrollRef}
          // Auto layout sizes columns from only the rows the virtualizer has mounted, so they
          // would shift as rows scroll in and out
          className={twMerge("w-full table-fixed", proxies.length > 1 ? "min-w-280" : "min-w-240")}
          containerClassName="min-h-0 thin-scrollbar overflow-auto [overflow-anchor:none]"
        >
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-48">Time</TableHead>
              {proxies.length > 1 && <TableHead className="w-40">Proxy</TableHead>}
              <TableHead className="w-24">Method</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Path</TableHead>
              <TableHead className="w-24">Upstream</TableHead>
              <TableHead className="w-36">Outcome</TableHead>
              <TableHead variant="action" className={canAddService ? "w-36" : "w-12"} />
            </TableRow>
            {liveState && (
              <LiveStatusRow
                state={liveState}
                columnCount={columnCount}
                recordCount={records.length}
                isRetrying={live.isFetching}
                onRetry={retryLive}
                newRequestCount={newRequests.count}
                onShowNewRequests={showNewRequests}
              />
            )}
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
              const proxyName = seenProxies.current.get(record.proxyId);
              const proxyAnswered = isProxyAnswered(record.decision);
              const outcome = (
                <Badge variant={presentation.variant}>
                  <presentation.icon />
                  {presentation.label}
                </Badge>
              );
              const host = (
                <span className="flex w-fit max-w-full items-center gap-2 text-sm">
                  <ServiceIcon hostPattern={record.host} />
                  <span className="truncate" title={record.service ? undefined : record.host}>
                    {record.host}
                  </span>
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
                      <span className="block truncate" title={proxyName}>
                        {proxyName}
                      </span>
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
                    <span className="block truncate" title={record.path}>
                      {record.path}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {!proxyAnswered && record.status ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={statusTone(record.status)}>{record.status}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {record.host} returned {httpStatusLabel(record.status)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {proxyAnswered && record.status ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{outcome}</TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          {proxyAnswerDescription(record)}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      outcome
                    )}
                  </TableCell>
                  <TableCell variant="action">
                    {isAddable && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => {
                              setServiceHost(hostPatternFor(record));
                              setIsServiceSheetOpen(true);
                            }}
                          >
                            <PlusIcon />
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

      {isTruncated && !(liveState === "paused" && visible.length > 0) && (
        <p className="text-xs text-muted">
          Showing the most recent {records.length.toLocaleString()} requests. Pick a time range to
          see further back.
          {liveState === "paused" && " Live updates are paused."}
        </p>
      )}

      {canAddService && accessBundle.id && (
        <ServiceSheet
          isOpen={isServiceSheetOpen}
          onOpenChange={setIsServiceSheetOpen}
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
