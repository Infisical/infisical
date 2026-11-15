import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FilterBar, type FilterBarFilter } from "@infisical/cipher/patterns/filter-bar";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { DateRangePicker, type DateRangePreset } from "@infisical/cipher/ui/date-range-picker";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { Link } from "@tanstack/react-router";
import { endOfDay, format, startOfDay, subHours, subMinutes } from "date-fns";

import {
  isInfisicalLogHost,
  isInfisicalSessionEndpointRequest
} from "@app/helpers/agentVaultSessionLogs";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  AgentVaultSessionLogDecision,
  AgentVaultSessionLogStorageType,
  AgentVaultSessionStatus
} from "@app/hooks/api/agentVault/enums";
import {
  AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS,
  getSessionLogStorageError
} from "@app/hooks/api/agentVault/queries";
import { sessionLogChunkKey } from "@app/hooks/api/agentVault/sessionLogDecrypt";
import type {
  TAgentVaultSession,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";
import {
  sessionLogRecordKey,
  useAgentVaultSessionLogTimeline
} from "@app/hooks/api/agentVault/useAgentVaultSessionLogTimeline";

import { useV4Adapter } from "../../data/adapters";
import { v4Path } from "../../links";
import { UpgradeDialog } from "../AgentVaultSettingsPage/session-logs/upgrade-dialog";
import { ServiceSheet } from "../resources/service-sheet";
import { ServiceIcon } from "../resources/shared";
import { SessionLogDetailsDialog } from "./session-log-details-dialog";
import {
  chunkIdTime,
  countSessionLogArrivals,
  DECISION_PRESENTATION,
  decisionPresentation,
  GAP_EXPLANATION,
  groupSessionLogGaps,
  hostPatternFor,
  isNativeSessionLogRecord,
  isProxyAnswered,
  isSessionEndpoint,
  matchesSessionLogSearch,
  nativeSessionLogSearchTerm,
  sessionEndTailDeadline,
  sessionLogMethodLabel,
  sessionLogRequestSummary,
  sessionLogSearchTerm,
  type TLogRange
} from "./session-logs";

const FILTER_SEARCH_STEP = 5000;
const EMPTY_PAGE_STEP = 5;
const UPLOAD_RECHECK_MS = 15_000;
const ROW_HEIGHT = 48;
const TABLE_HEIGHT = 640;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const WALK_AHEAD_ROWS = 30;

type TLiveState = "live" | "reconnecting" | "paused" | "ended";

const LIVE_STATE: Record<TLiveState, { label: string; tone: "ok" | "warn" | "outline" }> = {
  live: { label: "Live", tone: "ok" },
  reconnecting: { label: "Reconnecting", tone: "warn" },
  paused: { label: "Paused", tone: "outline" },
  ended: { label: "Session ended", tone: "outline" }
};

const liveStateDescription = (state: TLiveState, recordCount: number) => {
  if (state === "live") return "New requests show up here within about a minute.";
  if (state === "reconnecting")
    return `Couldn't check for new requests. Trying again every ${AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS / 1000} seconds.`;
  if (state === "paused")
    return `Showing the most recent ${recordCount.toLocaleString()} requests. Pick a time range to see further back.`;
  return "Its last requests can take up to a minute to show up.";
};

const useLiveTail = (session: TAgentVaultSession) => {
  const [range, setRange] = useState<TLogRange | null>(null);
  const [isRangeOpen, setIsRangeOpen] = useState(true);
  const applyRange = (next: TLogRange | null) => {
    setRange(next);
    setIsRangeOpen(!next || next.to.getTime() > Date.now());
  };
  useEffect(() => {
    if (!range || !isRangeOpen) return undefined;
    const remaining = range.to.getTime() - Date.now();
    if (remaining > MAX_TIMEOUT_MS) return undefined;
    const timer = setTimeout(() => setIsRangeOpen(false), Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [range, isRangeOpen]);

  const isActive = session.status === AgentVaultSessionStatus.Active;
  const tailEndsAt = sessionEndTailDeadline(session);
  const [endTail, setEndTail] = useState(() => ({
    endsAt: tailEndsAt,
    isOpen: tailEndsAt !== null && tailEndsAt > Date.now()
  }));
  if (endTail.endsAt !== tailEndsAt)
    setEndTail({ endsAt: tailEndsAt, isOpen: tailEndsAt !== null && tailEndsAt > Date.now() });
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

  const liveScope = [session.id, range?.from.getTime(), range?.to.getTime()].join("|");
  const [budgetLatch, setBudgetLatch] = useState({ scope: liveScope, isOver: false });
  if (budgetLatch.scope !== liveScope) setBudgetLatch({ scope: liveScope, isOver: false });
  const isPausedForBudget = budgetLatch.scope === liveScope && budgetLatch.isOver;
  const canTail = (isActive || isTailingEnd) && isRangeOpen;

  return {
    range,
    applyRange,
    isActive,
    canTail,
    isLive: canTail && !isPausedForBudget,
    isPausedForBudget,
    pauseForBudget: () => setBudgetLatch({ scope: liveScope, isOver: true })
  };
};

const useNewRequests = ({
  scroller,
  visible,
  arrivals,
  resetKey
}: {
  scroller: HTMLDivElement | null;
  visible: TAgentVaultSessionLogRecord[];
  arrivals: Map<string, number>;
  resetKey: string;
}) => {
  const [counted, setCounted] = useState({ key: resetKey, count: 0 });
  if (counted.key !== resetKey) setCounted({ key: resetKey, count: 0 });
  const shownBefore = useRef(visible);
  const countedAt = useRef<number | null>(null);

  useLayoutEffect(() => {
    const before = shownBefore.current;
    if (before === visible) {
      countedAt.current ??= Date.now();
      return;
    }
    shownBefore.current = visible;
    const since = countedAt.current ?? Date.now();
    countedAt.current = Date.now();
    if (!scroller || scroller.scrollTop === 0) return;
    const topIndex = Math.floor(scroller.scrollTop / ROW_HEIGHT);
    const anchor = before[topIndex];
    if (!anchor) return;
    const anchorKey = sessionLogRecordKey(anchor);
    const index = visible.findIndex((record) => sessionLogRecordKey(record) === anchorKey);
    if (index < 0) return;
    if (index !== topIndex) scroller.scrollBy({ top: (index - topIndex) * ROW_HEIGHT });
    const landedAbove = countSessionLogArrivals(visible.slice(0, index), arrivals, since);
    if (landedAbove) setCounted((prev) => ({ ...prev, count: prev.count + landedAbove }));
  }, [visible, arrivals, scroller]);

  const hasNew = counted.count > 0;
  useEffect(() => {
    if (!scroller || !hasNew) return undefined;
    const clearAtTop = () => {
      if (scroller.scrollTop < 1) setCounted((prev) => ({ ...prev, count: 0 }));
    };
    scroller.addEventListener("scroll", clearAtTop, { passive: true });
    return () => scroller.removeEventListener("scroll", clearAtTop);
  }, [hasNew, scroller]);

  return {
    newRequestCount: counted.count,
    showNewRequests: () => {
      setCounted((prev) => ({ ...prev, count: 0 }));
      scroller?.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
};

const useLastVisibleRow = (scroller: HTMLDivElement | null) => {
  const [lastRow, setLastRow] = useState(0);
  useEffect(() => {
    if (!scroller) return undefined;
    const measure = () =>
      setLastRow(Math.ceil((scroller.scrollTop + scroller.clientHeight) / ROW_HEIGHT));
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => scroller.removeEventListener("scroll", measure);
  }, [scroller]);
  return lastRow;
};

const OutcomeBadge = ({ record }: { record: TAgentVaultSessionLogRecord }) => {
  const { label, tone, icon } = decisionPresentation(record.decision);
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
};

const upstreamOf = (record: TAgentVaultSessionLogRecord) =>
  !isNativeSessionLogRecord(record) && !isProxyAnswered(record.decision) && record.status
    ? record.status
    : null;

const hostLabelOf = (record: TAgentVaultSessionLogRecord) =>
  isNativeSessionLogRecord(record) && record.service ? record.service : record.host;

const truncate = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
} as const;

const LOG_COLUMNS: DataTableColumn<TAgentVaultSessionLogRecord>[] = [
  {
    id: "time",
    header: "Time",
    width: 176,
    mono: true,
    render: (record) => format(new Date(record.ts), "MMM d, HH:mm:ss")
  },
  {
    id: "request",
    header: "Request",
    grow: true,
    primary: true,
    text: (record) => hostLabelOf(record),
    render: (record) => {
      const summary = sessionLogRequestSummary(record);
      return (
        <Inline
          gap={8}
          align="center"
          wrap={false}
          style={{ minWidth: 0, overflow: "hidden" }}
          title={[sessionLogMethodLabel(record), hostLabelOf(record), summary]
            .filter(Boolean)
            .join(" ")}
        >
          <ServiceIcon
            hostPattern={
              isSessionEndpoint(record.decision) || isInfisicalLogHost(record)
                ? "infisical.com"
                : record.host
            }
            serviceType={record.serviceType}
          />
          <span style={{ ...truncate, flexShrink: 0, maxWidth: "60%" }}>{hostLabelOf(record)}</span>
          <Meta style={{ ...truncate, flex: "1 1 0" }}>
            {[sessionLogMethodLabel(record), summary].filter(Boolean).join(" ")}
          </Meta>
        </Inline>
      );
    }
  },
  {
    id: "upstream",
    header: "Upstream",
    width: 96,
    mono: true,
    render: (record) => upstreamOf(record) ?? <Meta>-</Meta>
  },
  {
    id: "outcome",
    header: "Outcome",
    width: 140,
    render: (record) => <OutcomeBadge record={record} />
  }
];

const OUTCOME_FIELD = "outcome";

const rangeOf = (value: { from?: Date; to?: Date } | undefined): TLogRange | null => {
  if (!value?.from || !value.to) return null;
  const isWholeDays =
    value.from.getTime() === startOfDay(value.from).getTime() &&
    value.to.getTime() === startOfDay(value.to).getTime();
  return isWholeDays
    ? { from: value.from, to: endOfDay(value.to) }
    : { from: value.from, to: value.to };
};

const livePresets = (): DateRangePreset[] => {
  const now = new Date();
  return [
    { label: "Last 15 minutes", range: { from: subMinutes(now, 15), to: now } },
    { label: "Last hour", range: { from: subHours(now, 1), to: now } },
    { label: "Last 24 hours", range: { from: subHours(now, 24), to: now } }
  ];
};

const SettingsLink = ({
  orgId,
  projectId,
  variant = "outline"
}: {
  orgId: string;
  projectId: string;
  variant?: "outline" | "accent";
}) => (
  <Button variant={variant} size={variant === "outline" ? "sm" : undefined} asChild>
    <Link
      to={v4Path("/organizations/$orgId/projects/agent-vault/$projectId/settings")}
      params={{ orgId, projectId }}
      search={{ selectedTab: "tab-session-logs" }}
    >
      Go to settings
    </Link>
  </Button>
);

export const SessionLogsPanel = ({
  orgId,
  projectId,
  session,
  isAdmin
}: {
  orgId: string;
  projectId: string;
  session: TAgentVaultSession;
  isAdmin: boolean;
}) => {
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
  const [opened, setOpened] = useState<TAgentVaultSessionLogRecord | null>(null);
  const [serviceRequest, setServiceRequest] = useState<{ host: string; path: string } | null>(null);
  const bundle = session.accessBundle;
  const { data: bundleDetail } = useV4Adapter("agentVaultResources").useAccessBundle(
    projectId,
    isAdmin ? (bundle?.id ?? "") : ""
  );
  const columns = useMemo(() => {
    if (!isAdmin || !bundle?.id || !bundleDetail) return LOG_COLUMNS;
    const covered = bundleDetail.services.flatMap((service) =>
      "hostPattern" in service ? service.hostPattern.split(",").map((host) => host.trim()) : []
    );
    const isCovered = (host: string) =>
      covered.some(
        (pattern) =>
          pattern === host || (pattern.startsWith("*.") && host.endsWith(pattern.slice(1)))
      );
    const isAddable = (record: TAgentVaultSessionLogRecord) =>
      !record.service &&
      !isNativeSessionLogRecord(record) &&
      (record.decision === AgentVaultSessionLogDecision.Blocked ||
        record.decision === AgentVaultSessionLogDecision.Passthrough) &&
      !isInfisicalSessionEndpointRequest(record) &&
      !isCovered(hostPatternFor(record));
    const addColumn: DataTableColumn<TAgentVaultSessionLogRecord> = {
      id: "add-service",
      header: "Add service",
      hideHeader: true,
      actions: true,
      render: (record) =>
        isAddable(record) ? (
          <Tooltip content={`Add ${record.host} to ${bundle.name}`}>
            <Button
              variant="ghost"
              size="icon-row"
              icon="plus"
              iconOnly
              onClick={() => setServiceRequest({ host: hostPatternFor(record), path: record.path })}
            >
              Add service
            </Button>
          </Tooltip>
        ) : null
    };
    return [...LOG_COLUMNS, addColumn];
  }, [isAdmin, bundle, bundleDetail]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterBarFilter[]>([]);
  const [rangeDraft, setRangeDraft] = useState<{ from?: Date; to?: Date }>();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const attachScroller = useCallback((node: HTMLDivElement | null) => {
    if (node) setScroller(node);
  }, []);
  const decisionFilter = filters.find((filter) => filter.field === OUTCOME_FIELD)?.values[0];

  const { range, applyRange, isActive, canTail, isLive, isPausedForBudget, pauseForBudget } =
    useLiveTail(session);
  const { history, live, arrived, isLiveGapUnfilled } = useV4Adapter("agentVault").useSessionLogs(
    orgId,
    projectId,
    session.id,
    {
      isLive,
      from: range?.from,
      to: range?.to
    }
  );
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
  const [now, setNow] = useState(() => Date.now());
  const {
    records,
    hasOpenedRecords,
    gaps,
    arrivals,
    isTruncated,
    isOverByteBudget,
    hasUploadingChunks
  } = useAgentVaultSessionLogTimeline(pages, now, range?.from.getTime(), range?.to.getTime());

  useEffect(() => {
    if (!hasUploadingChunks) return undefined;
    const timer = setTimeout(() => {
      setNow(Date.now());
      if (!isLive || document.visibilityState === "hidden")
        refetch({ cancelRefetch: false }).catch(() => {});
    }, UPLOAD_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [hasUploadingChunks, isLive, now, refetch]);
  useEffect(() => {
    if (isOverByteBudget && !isPlaceholderData && !isPausedForBudget) pauseForBudget();
  }, [isOverByteBudget, isPlaceholderData, isPausedForBudget, pauseForBudget]);
  const isLoadError = isError && !data;

  const isEnabled = pages?.[0]?.sessionLogs.enabled ?? false;
  const disabledReason = pages?.[0]?.sessionLogs.disabledReason ?? null;
  const isDefaultStorage =
    pages?.[0]?.sessionLogs.storageType === AgentVaultSessionLogStorageType.Default;
  const isRecordable = pages?.[0]?.sessionLogs.isRecordable ?? true;
  const isWatching = isLive && isEnabled && isRecordable;
  let liveState: TLiveState | null = null;
  if (canTail && isPausedForBudget) liveState = "paused";
  else if (isWatching && live.isError) liveState = "reconnecting";
  else if (isWatching && !isActive) liveState = "ended";
  else if (isWatching) liveState = "live";
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);
  const storageError = data ? null : getSessionLogStorageError(history.error);

  const visible = useMemo(
    () =>
      records.filter(
        (record) =>
          (!decisionFilter || record.decision === decisionFilter) &&
          matchesSessionLogSearch(record, search)
      ),
    [records, search, decisionFilter]
  );

  const hasBrowserFilter =
    Boolean(sessionLogSearchTerm(search) || nativeSessionLogSearchTerm(search)) ||
    Boolean(decisionFilter);
  const isFiltered = hasBrowserFilter || Boolean(range);

  const { searched, emptyRun, oldestChunkAt } = useMemo(
    () =>
      (data?.pages ?? []).reduce(
        (totals, page) => {
          const openedCount = page.chunks.reduce(
            (sum, chunk) => sum + (page.decrypted[sessionLogChunkKey(chunk)]?.records.length ?? 0),
            0
          );
          const lastRequestTimes = page.chunks.map((chunk) => chunkIdTime(chunk.chunkId).getTime());
          return {
            searched: totals.searched + openedCount,
            emptyRun: openedCount ? 0 : totals.emptyRun + 1,
            oldestChunkAt: lastRequestTimes.length
              ? Math.min(totals.oldestChunkAt ?? Infinity, ...lastRequestTimes)
              : totals.oldestChunkAt
          };
        },
        { searched: 0, emptyRun: 0, oldestChunkAt: null as number | null }
      ),
    [data]
  );
  const loadedPages = data?.pages.length ?? 0;
  const filterKey = [
    sessionLogSearchTerm(search),
    nativeSessionLogSearchTerm(search),
    decisionFilter,
    range?.from.getTime(),
    range?.to.getTime()
  ].join("|");
  const nextAllowance = () => ({
    filterKey,
    until: searched + FILTER_SEARCH_STEP,
    pagesAt: loadedPages
  });
  const [allowance, setAllowance] = useState(nextAllowance);
  if (!isPlaceholderData && allowance.filterKey !== filterKey) setAllowance(nextAllowance());
  const searchOlder = () => setAllowance(nextAllowance());
  const isSearchPaused =
    hasNextPage &&
    !isTruncated &&
    ((hasBrowserFilter && searched >= allowance.until) ||
      Math.min(emptyRun, loadedPages - allowance.pagesAt) >= EMPTY_PAGE_STEP);
  const isFirstPageLoaded = Boolean(data?.pages.length) && !isPlaceholderData;
  const lastPage = data?.pages[data.pages.length - 1];
  const searchedBackTo =
    lastPage?.nextCursor && oldestChunkAt !== null ? new Date(oldestChunkAt) : null;

  const lastVisibleRow = useLastVisibleRow(scroller);
  useEffect(() => {
    if (
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      isPlaceholderData ||
      isTruncated ||
      isSearchPaused
    )
      return;
    if (isFirstPageLoaded && lastVisibleRow >= visible.length - WALK_AHEAD_ROWS)
      fetchNextPage({ cancelRefetch: false }).catch(() => {});
  }, [
    lastVisibleRow,
    visible.length,
    isFirstPageLoaded,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    isPlaceholderData,
    isTruncated,
    isSearchPaused,
    fetchNextPage
  ]);
  const { newRequestCount, showNewRequests } = useNewRequests({
    scroller,
    visible,
    arrivals,
    resetKey: `${session.id}|${filterKey}`
  });

  const isOpening = (isPending || isPlaceholderData) && visible.length === 0;
  const isSearchFailed = isFiltered && isFetchNextPageError;
  const isWalkingBack =
    isFirstPageLoaded && hasNextPage && !isSearchPaused && !isTruncated && !isFetchNextPageError;
  const isStillSearching = isFiltered && isWalkingBack;
  const isStillLoading = !isFiltered && records.length === 0 && isWalkingBack;
  const isUnreachable =
    gaps.length > 0 && !hasOpenedRecords && gaps.every((gap) => gap.reason === "fetch");

  const retryButton = (
    <Button
      variant="outline"
      size="sm"
      loading={isRefetching}
      onClick={() => refetch().catch(() => {})}
    >
      Reload
    </Button>
  );

  if (storageError)
    return (
      <EmptyState
        size="sm"
        icon="alert"
        title="Session logs can't be read"
        description={storageError}
        actions={
          <Inline gap={8}>
            {retryButton}
            {isAdmin && !isDefaultStorage && <SettingsLink orgId={orgId} projectId={projectId} />}
          </Inline>
        }
      />
    );

  if (!isPending && !isPlaceholderData && !isLoadError && disabledReason === "not-on-plan")
    return (
      <>
        <EmptyState
          size="sm"
          icon="lock"
          title="Session logs aren't on your plan"
          description={
            isAdmin
              ? "Upgrade to see recorded logs and record what your agents reach."
              : "Ask a project admin about upgrading."
          }
          actions={
            isAdmin ? (
              <Button variant="accent" onClick={() => setIsUpgradeOpen(true)}>
                Upgrade
              </Button>
            ) : undefined
          }
        />
        <UpgradeDialog
          storageType={
            isUpgradeOpen
              ? (pages?.[0]?.sessionLogs.storageType ?? AgentVaultSessionLogStorageType.External)
              : null
          }
          onClose={() => setIsUpgradeOpen(false)}
        />
      </>
    );

  if (!isPending && !isPlaceholderData && !isLoadError && disabledReason)
    return (
      <EmptyState
        size="sm"
        icon="history"
        title="Session logs are off"
        description={
          isAdmin
            ? "Turn them on in Settings to record what your agents do."
            : "Ask a project admin to turn them on."
        }
        actions={
          isAdmin && isActive ? (
            <SettingsLink orgId={orgId} projectId={projectId} variant="accent" />
          ) : undefined
        }
      />
    );

  if (
    !isPending &&
    !isPlaceholderData &&
    !isLoadError &&
    isActive &&
    isEnabled &&
    !isRecordable &&
    !hasChunks
  )
    return (
      <EmptyState
        size="sm"
        icon="history"
        title="Session logs aren't available for this session"
        description="To record requests, create a new session and run it through a proxy on the latest Infisical CLI."
      />
    );

  let emptyTitle: string;
  let emptyDescription: string | undefined;
  let emptyAction: React.ReactNode;
  if (isOpening || isStillLoading) emptyTitle = "Loading requests";
  else if (isLoadError) {
    emptyTitle = "Failed to load session logs";
    emptyDescription = "Something went wrong while loading this session's requests.";
    emptyAction = (
      <Button variant="outline" loading={isFetching} onClick={() => refetch().catch(() => {})}>
        Reload
      </Button>
    );
  } else if (isFetchNextPageError) {
    emptyTitle = isSearchFailed
      ? "Failed to search older requests"
      : "Couldn't load older requests";
    emptyDescription = isSearchFailed
      ? "Something went wrong while loading older requests."
      : undefined;
    emptyAction = (
      <Button
        variant="outline"
        loading={isFetchingNextPage}
        onClick={() => fetchNextPage().catch(() => {})}
      >
        {isSearchFailed ? "Search again" : "Retry"}
      </Button>
    );
  } else if (isStillSearching) emptyTitle = "Searching older requests";
  else if (gaps.length > 0 && !hasOpenedRecords && !hasNextPage) {
    emptyTitle = "Session logs unavailable";
    emptyDescription = "None of this session's logs could be loaded.";
  } else if (isSearchPaused) {
    emptyTitle = `No ${hasBrowserFilter ? "matching" : "readable"} requests ${
      searchedBackTo ? `since ${format(searchedBackTo, "MMM d, h:mm a")}` : "found yet"
    }`;
    emptyDescription = "Older requests have not been searched yet.";
    emptyAction = (
      <Button variant="outline" onClick={searchOlder}>
        Search older requests
      </Button>
    );
  } else if (range && (!hasChunks || !hasBrowserFilter)) {
    emptyTitle = "No requests in this range";
    emptyDescription = `This session recorded nothing between ${format(range.from, "MMM d, yyyy HH:mm")} and ${format(range.to, "MMM d, yyyy HH:mm")}.`;
  } else if (isFiltered) {
    emptyTitle = "No requests match these filters";
    emptyDescription = "Try a different search term, outcome or time range.";
  } else if (liveState === "live") {
    emptyTitle = "Waiting for requests";
    emptyDescription = "Requests made through a proxy show up here within about a minute.";
  } else if (liveState === "reconnecting") {
    emptyTitle = "Couldn't check for new requests";
    emptyDescription = `Trying again every ${AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS / 1000} seconds.`;
    emptyAction = (
      <Button variant="outline" loading={live.isFetching} onClick={retryLive}>
        Check now
      </Button>
    );
  } else if (liveState === "ended") {
    emptyTitle = "Nothing recorded yet";
    emptyDescription = "Its last requests can take up to a minute to show up.";
  } else {
    emptyTitle = isActive ? "Nothing recorded yet" : "No requests recorded";
    emptyDescription = isActive
      ? "Requests this session makes through a proxy will appear here shortly after."
      : undefined;
  }

  let end: React.ReactNode;
  if (isFetchingNextPage) end = "Loading more";
  else if (isFetchNextPageError)
    end = (
      <Inline gap={4} align="center" justify="center">
        Couldn&apos;t load older requests.
        <Button variant="link" onClick={() => fetchNextPage().catch(() => {})}>
          Retry
        </Button>
      </Inline>
    );
  else if (isSearchPaused)
    end = (
      <Inline gap={4} align="center" justify="center">
        {searchedBackTo ? `Searched back to ${format(searchedBackTo, "MMM d, h:mm a")}.` : null}
        <Button variant="link" onClick={searchOlder}>
          Search older requests
        </Button>
      </Inline>
    );
  else if (!hasNextPage && visible.length * ROW_HEIGHT > TABLE_HEIGHT) end = "No more requests";

  const settingsLink = isAdmin && !isDefaultStorage && (
    <SettingsLink orgId={orgId} projectId={projectId} />
  );

  return (
    <Stack gap={12}>
      <FilterBar
        label="Session log filters"
        width="fill"
        searchLabel="Search requests"
        searchPlaceholder="Search host, path, method, tool, service, statement or output"
        searchValue={search}
        onSearchChange={setSearch}
        fields={[
          {
            key: OUTCOME_FIELD,
            label: "Outcome",
            type: "select",
            options: Object.entries(DECISION_PRESENTATION).map(([value, { label }]) => ({
              value,
              label
            }))
          }
        ]}
        value={filters}
        onChange={setFilters}
        actions={
          <DateRangePicker
            aria-label="Time range"
            placeholder="Entire session"
            align="end"
            value={rangeDraft?.from ? { from: rangeDraft.from, to: rangeDraft.to } : undefined}
            presets={isActive ? livePresets() : undefined}
            disabled={[{ before: startOfDay(new Date(session.createdAt)) }, { after: new Date() }]}
            onValueChange={(next) => {
              setRangeDraft(next);
              const picked = rangeOf(next);
              if (picked || !next) applyRange(picked);
            }}
          />
        }
      />

      {isUnreachable && (
        <Alert
          tone="warn"
          actions={
            <Inline gap={8}>
              {retryButton}
              {settingsLink}
            </Inline>
          }
        >
          {isDefaultStorage
            ? `Your browser couldn't download this session's logs. Your network may be blocking them. Try again, or contact ${isInfisicalCloud() ? "Infisical support" : "your server administrator"} if it keeps happening.`
            : `None of this session's logs could be downloaded from the bucket. The bucket's CORS rule may not allow this origin, or this network may block the bucket.${isAdmin ? "" : " Ask a project admin to check the bucket's CORS rule."}`}
        </Alert>
      )}

      {isLiveGapUnfilled && (
        <Alert tone="warn" actions={retryButton}>
          Some recent requests may be missing.
        </Alert>
      )}

      {!isUnreachable && gaps.length > 0 && (
        <Alert
          tone="warn"
          actions={
            !isFetchNextPageError &&
            gaps.some((gap) => gap.reason === "fetch" || gap.reason === "refused")
              ? retryButton
              : undefined
          }
        >
          {groupSessionLogGaps(gaps)
            .map(
              ({ reason, chunkCount }) =>
                `${chunkCount.toLocaleString()} ${chunkCount === 1 ? "batch" : "batches"} of requests ${
                  GAP_EXPLANATION[reason][chunkCount === 1 ? "one" : "many"]
                }.`
            )
            .join(" ")}
        </Alert>
      )}

      {liveState && (
        <Inline gap={8} align="center" wrap={false} role="status" style={{ minWidth: 0 }}>
          <Badge tone={LIVE_STATE[liveState].tone} dot>
            {LIVE_STATE[liveState].label}
          </Badge>
          <Meta
            mono={false}
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {liveStateDescription(liveState, records.length)}
          </Meta>
          {liveState === "reconnecting" && (
            <Button variant="link" loading={live.isFetching} onClick={retryLive}>
              Check now
            </Button>
          )}
          {newRequestCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              icon="arrow-up"
              onClick={showNewRequests}
              style={{ marginInlineStart: "auto" }}
            >
              {`${newRequestCount.toLocaleString()} new ${newRequestCount === 1 ? "request" : "requests"}`}
            </Button>
          )}
        </Inline>
      )}

      <DataTable<TAgentVaultSessionLogRecord>
        label="Session requests"
        rows={visible}
        columns={columns}
        getRowId={sessionLogRecordKey}
        rowLabel={(record) => `${sessionLogMethodLabel(record)} ${hostLabelOf(record)}`}
        onRowActivate={setOpened}
        loading={isOpening}
        refreshing={isStillSearching || isStillLoading}
        virtual
        rowHeight={ROW_HEIGHT}
        height={TABLE_HEIGHT}
        containerRef={attachScroller}
        end={visible.length ? end : undefined}
        persistentStatus={
          isTruncated && liveState !== "paused"
            ? `Showing the most recent ${records.length.toLocaleString()} requests. Pick a time range to see further back.`
            : undefined
        }
        empty={
          <EmptyState
            size="sm"
            media="bare"
            icon="history"
            title={emptyTitle}
            description={emptyDescription}
            actions={emptyAction}
          />
        }
      />

      <SessionLogDetailsDialog record={opened} onClose={() => setOpened(null)} />
      {serviceRequest && bundle?.id && (
        <ServiceSheet
          projectId={projectId}
          accessBundleId={bundle.id}
          request={serviceRequest}
          onOpenChange={(open) => !open && setServiceRequest(null)}
        />
      )}
    </Stack>
  );
};
