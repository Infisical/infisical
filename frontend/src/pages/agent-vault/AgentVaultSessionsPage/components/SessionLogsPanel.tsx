import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { ServiceSheet } from "@app/components/agent-vault/service-sheet";
import {
  Alert,
  AlertAction,
  AlertDescription,
  Button,
  DateRangeFilter,
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
  TableRow
} from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import {
  AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS,
  AgentVaultSessionLogDecision,
  sessionLogRecordKey,
  useAgentVaultSessionLogTimeline,
  useGetAgentVaultSessionLogs
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultSession,
  TAgentVaultSessionLogGapReason,
  TAgentVaultSessionLogRecord
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { LiveState, LiveStateBadge, LiveStatusRow } from "./LiveStatusRow";
import { DECISION_PRESENTATION, hostPatternFor, SessionLogRow } from "./SessionLogRow";
import {
  chunkIdTime,
  groupSessionLogGaps,
  matchesSessionLogSearch,
  sessionLogSearchTerm
} from "./SessionLogsPanel.utils";
import { useNewRequestsCounter } from "./useNewRequestsCounter";
import { useSessionLogsLiveTail } from "./useSessionLogsLiveTail";

const ALL_PROXIES = "all";

const FILTER_SEARCH_STEP = 5000;

const SESSION_LOG_ROW_HEIGHT = 41;

type DecisionFilter = "all" | AgentVaultSessionLogDecision;

const GAP_EXPLANATION: Record<TAgentVaultSessionLogGapReason, { one: string; many: string }> = {
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

// Every proxy that has sent this session a chunk, kept once seen so the proxy filter doesn't lose
// options when a time range reloads the pages.
const useSeenProxyNames = (
  sessionId: string,
  pages: { chunks: { proxyId: string; proxyName: string }[] }[] | undefined
) => {
  const [seen, setSeen] = useState({ sessionId, names: new Map<string, string>() });
  const names = seen.sessionId === sessionId ? seen.names : new Map<string, string>();
  const unseen = (pages ?? [])
    .flatMap((page) => page.chunks)
    .filter((chunk) => !names.has(chunk.proxyId));
  if (seen.sessionId !== sessionId || unseen.length) {
    const next = new Map(names);
    unseen.forEach((chunk) => {
      if (!next.has(chunk.proxyId)) next.set(chunk.proxyId, chunk.proxyName);
    });
    setSeen({ sessionId, names: next });
    return next;
  }
  return names;
};

type Props = {
  session: TAgentVaultSession;
};

export const SessionLogsPanel = ({ session }: Props) => {
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
  const { range, applyRange, isActive, canTail, isLive, isPausedForBudget, pauseForBudget } =
    useSessionLogsLiveTail(session);
  const { history, live, arrived } = useGetAgentVaultSessionLogs(session.id, {
    isLive,
    from: range?.startDate,
    to: range?.endDate
  });
  let liveState: LiveState | null = null;
  if (canTail && isPausedForBudget) liveState = "paused";
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
    useAgentVaultSessionLogTimeline(pages);
  if (isOverByteBudget && !isPlaceholderData && !isPausedForBudget) pauseForBudget();
  const isLoadError = isError && !data;

  const isEnabled = pages?.[0]?.sessionLogs.enabled ?? false;
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);
  const storageUnavailable =
    data?.pages.find((page) => page.sessionLogs.storageUnavailable)?.sessionLogs
      .storageUnavailable ?? null;

  const proxyNames = useSeenProxyNames(session.id, pages);
  const proxies = [...proxyNames.entries()].map(([id, name]) => ({ id, name }));

  const visible = useMemo(
    () =>
      records.filter((record) => {
        if (range) {
          const at = Date.parse(record.ts);
          if (at < range.startDate.getTime() || at > range.endDate.getTime()) return false;
        }
        if (decisionFilter !== "all" && record.decision !== decisionFilter) return false;
        if (proxyFilter !== ALL_PROXIES && record.proxyId !== proxyFilter) return false;
        return matchesSessionLogSearch(record, search);
      }),
    [records, search, decisionFilter, proxyFilter, range]
  );

  const hasBrowserFilter =
    Boolean(sessionLogSearchTerm(search)) ||
    decisionFilter !== "all" ||
    proxyFilter !== ALL_PROXIES;
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
    sessionLogSearchTerm(search),
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
  // A session whose loaded chunks were all unreadable walks back in the same steps as a filtered
  // search, so a bucket that refuses every chunk can't pull the whole session.
  const isSearchPaused =
    (hasBrowserFilter || records.length === 0) &&
    Boolean(hasNextPage) &&
    !isTruncated &&
    searched >= allowance.until;
  const isFirstPageLoaded = Boolean(data?.pages.length) && !isPlaceholderData;

  const lastPage = data?.pages[data.pages.length - 1];
  const oldestChunkId = lastPage?.nextCursor ? lastPage.chunks.at(-1)?.chunkId : undefined;
  const searchedBackTo = oldestChunkId ? chunkIdTime(oldestChunkId) : null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => SESSION_LOG_ROW_HEIGHT,
    overscan: 16
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const lastVisibleIndex = virtualRows.length ? virtualRows[virtualRows.length - 1].index : 0;
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
    if (isFirstPageLoaded && lastVisibleIndex >= visible.length - 30)
      fetchNextPage().catch(() => {});
  }, [
    lastVisibleIndex,
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
  const columnCount = proxies.length > 1 ? 8 : 7;
  const overflows = rowVirtualizer.getTotalSize() > (rowVirtualizer.scrollRect?.height ?? Infinity);
  const { newRequestCount, showNewRequests } = useNewRequestsCounter({
    scrollRef,
    visible,
    arrivals,
    resetKey: `${session.id}|${filterKey}`,
    rowHeight: SESSION_LOG_ROW_HEIGHT
  });

  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const isOpening = (isPending || isPlaceholderData) && visible.length === 0;
  const isSearchFailed = isFiltered && isFetchNextPageError;
  const isWalkingBack =
    isFirstPageLoaded &&
    Boolean(hasNextPage) &&
    !isSearchPaused &&
    !isTruncated &&
    !isFetchNextPageError;
  const isStillSearching = isFiltered && isWalkingBack;
  const isStillLoading = !isFiltered && records.length === 0 && isWalkingBack;

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
  } else if (isFetchNextPageError) {
    noRecordsTitle = "Couldn't load older requests";
    noRecordsDescription = "";
  } else if (isStillSearching) {
    noRecordsTitle = "Searching older requests";
    noRecordsDescription = "";
  } else if (isStillLoading) {
    noRecordsTitle = "Loading requests";
    noRecordsDescription = "";
  } else if (hasChunks && records.length === 0 && !hasNextPage) {
    noRecordsTitle = "Session logs unavailable";
    noRecordsDescription = "None of this session's logs could be loaded.";
  } else if (isSearchPaused && searchedBackTo) {
    noRecordsTitle = `No ${hasBrowserFilter ? "matching" : "readable"} requests since ${format(
      searchedBackTo,
      "MMM d, h:mm a"
    )}`;
    noRecordsDescription = "Older requests have not been searched yet.";
  } else if (range && (!hasChunks || !hasBrowserFilter)) {
    noRecordsTitle = "No requests in this range";
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
    noRecordsDescription = `Trying again every ${AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS / 1000} seconds.`;
  } else if (liveState === "ended") {
    noRecordsLiveState = liveState;
    noRecordsTitle = "Nothing recorded yet";
    noRecordsDescription = "Its last requests can take up to a minute to show up.";
  } else {
    noRecordsTitle = isActive ? "Nothing recorded yet" : "No requests recorded";
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
          "The AWS connection for session logs can't be used right now.")
        : "No AWS connection is set for session logs, so this session's recorded requests can't be loaded.";
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
          <EmptyTitle>Session logs are off</EmptyTitle>
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
            {Object.entries(DECISION_PRESENTATION).map(
              ([value, { label, icon: Icon, iconClassName }]) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <Icon className={iconClassName} />
                    {label}
                  </span>
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
        <DateRangeFilter
          accent="av"
          className="h-9"
          isActive={Boolean(range)}
          inactiveLabel="Entire Session"
          showTimezoneToggle={false}
          earliestDate={new Date(session.createdAt)}
          showRelativeRanges={isActive}
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
              {groupSessionLogGaps(gaps).map(({ reason, recordCount }) => (
                <span key={reason}>
                  {recordCount.toLocaleString()} {recordCount === 1 ? "request" : "requests"}{" "}
                  {GAP_EXPLANATION[reason][recordCount === 1 ? "one" : "many"]}.
                </span>
              ))}
            </div>
            {!isFetchNextPageError &&
              gaps.some((gap) => gap.reason === "fetch" || gap.reason === "refused") && (
                <AlertAction>{retryButton}</AlertAction>
              )}
          </AlertDescription>
        </Alert>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            {(isOpening || isStillSearching || isStillLoading) && <Spinner size="sm" />}
            {noRecordsLiveState && <LiveStateBadge state={noRecordsLiveState} />}
            <EmptyTitle>{noRecordsTitle}</EmptyTitle>
            {noRecordsDescription && <EmptyDescription>{noRecordsDescription}</EmptyDescription>}
          </EmptyHeader>
          {noRecordsLiveState === "reconnecting" && (
            <Button variant="outline" size="sm" isPending={live.isFetching} onClick={retryLive}>
              Check Now
            </Button>
          )}
          {isSearchPaused && !isFetchNextPageError && (
            <Button variant="outline" size="sm" onClick={searchOlder}>
              Search Older Requests
            </Button>
          )}
          {isFetchNextPageError && (
            <Button
              variant="outline"
              size="sm"
              isPending={isFetchingNextPage}
              onClick={() => fetchNextPage().catch(() => {})}
            >
              {isSearchFailed ? "Search Again" : "Retry"}
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
                newRequestCount={newRequestCount}
                onShowNewRequests={showNewRequests}
              />
            )}
          </TableHeader>
          <TableBody>
            {padTop > 0 && <tr style={{ height: padTop }} />}
            {virtualRows.map((virtualRow) => {
              const record = visible[virtualRow.index] as TAgentVaultSessionLogRecord;
              const isAddable =
                canAddService &&
                !record.service &&
                (record.decision === AgentVaultSessionLogDecision.Blocked ||
                  record.decision === AgentVaultSessionLogDecision.Passthrough) &&
                !addedHosts.has(hostPatternFor(record));
              return (
                <SessionLogRow
                  key={sessionLogRecordKey(record)}
                  record={record}
                  arrivedAt={arrivals.get(sessionLogRecordKey(record))}
                  proxyName={proxyNames.get(record.proxyId)}
                  showProxy={proxies.length > 1}
                  accessBundleName={accessBundle?.name}
                  onAddService={
                    isAddable
                      ? () => {
                          setServiceHost(hostPatternFor(record));
                          setIsServiceSheetOpen(true);
                        }
                      : undefined
                  }
                />
              );
            })}
            {padBottom > 0 && <tr style={{ height: padBottom }} />}
            {(isFetchingNextPage ||
              isFetchNextPageError ||
              isSearchPaused ||
              (!hasNextPage && overflows)) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="text-center text-xs text-muted">
                  {isFetchingNextPage && (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner size="xs" />
                      Loading more
                    </span>
                  )}
                  {!isFetchingNextPage && isFetchNextPageError && (
                    <span className="flex items-center justify-center gap-1">
                      Couldn&apos;t load older requests ·
                      <Button
                        variant="link"
                        size="xs"
                        onClick={() => fetchNextPage().catch(() => {})}
                      >
                        Retry
                      </Button>
                    </span>
                  )}
                  {!isFetchingNextPage &&
                    !isFetchNextPageError &&
                    isSearchPaused &&
                    searchedBackTo && (
                      <span className="flex items-center justify-center gap-1">
                        Searched back to {format(searchedBackTo, "MMM d, h:mm a")} ·
                        <Button variant="link" size="xs" onClick={searchOlder}>
                          Search Older Requests
                        </Button>
                      </span>
                    )}
                  {!isFetchingNextPage &&
                    !isFetchNextPageError &&
                    !isSearchPaused &&
                    "No more requests"}
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
