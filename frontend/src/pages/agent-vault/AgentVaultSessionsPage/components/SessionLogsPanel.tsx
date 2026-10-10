import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { SearchIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
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
import { useOrganization, useProjectPermission, useSubscription } from "@app/context";
import {
  AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS,
  AgentVaultSessionLogDecision,
  getSessionLogStorageError,
  sessionLogRecordKey,
  useAgentVaultSessionLogTimeline,
  useGetAgentVaultSessionLogs
} from "@app/hooks/api/agentVault";
import { sessionLogChunkKey } from "@app/hooks/api/agentVault/sessionLogDecrypt";
import {
  TAgentVaultSession,
  TAgentVaultSessionLogGapReason
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

const FILTER_SEARCH_STEP = 5000;

// A walk back that finds nothing readable this many pages in a row pauses, so a bucket that refuses older
// chunks can't pull the whole session.
const EMPTY_PAGE_STEP = 5;

const UPLOAD_RECHECK_MS = 15_000;

const SESSION_LOG_ROW_HEIGHT = 41;

type DecisionFilter = "all" | AgentVaultSessionLogDecision;

const GAP_EXPLANATION: Record<TAgentVaultSessionLogGapReason, { one: string; many: string }> = {
  fetch: { one: "could not be read from the bucket", many: "could not be read from the bucket" },
  missing: { one: "isn't in the bucket", many: "aren't in the bucket" },
  refused: { one: "was refused by the bucket", many: "were refused by the bucket" },
  size: {
    one: "doesn't match what the proxy uploaded",
    many: "don't match what the proxy uploaded"
  },
  gcm: { one: "could not be decrypted", many: "could not be decrypted" },
  json: {
    one: "was decrypted but could not be read",
    many: "were decrypted but could not be read"
  },
  mismatch: {
    one: "holds requests from a different proxy",
    many: "hold requests from a different proxy"
  }
};

const COLUMN_COUNT = 7;

type Props = {
  session: TAgentVaultSession;
};

export const SessionLogsPanel = ({ session }: Props) => {
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);
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
  const { range, applyRange, isActive, canTail, isLive, isPausedForBudget, pauseForBudget } =
    useSessionLogsLiveTail(session);
  const { history, live, arrived } = useGetAgentVaultSessionLogs(session.id, {
    isLive,
    from: range?.startDate,
    to: range?.endDate
  });
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
  const { records, gaps, arrivals, isTruncated, isOverByteBudget, hasUploadingChunks } =
    useAgentVaultSessionLogTimeline(pages, now);
  // While a chunk from the live tail may still be uploading, the clock keeps moving so it turns into a missing
  // gap once its grace runs out. A live poll retries the chunk itself, but polling stops in a hidden tab and after
  // the session ends; then history reloads instead, since the bucket listing has the chunk once it lands.
  useEffect(() => {
    if (!hasUploadingChunks) return undefined;
    const timer = setTimeout(() => {
      setNow(Date.now());
      if (!isLive || document.visibilityState === "hidden")
        refetch({ cancelRefetch: false }).catch(() => {});
    }, UPLOAD_RECHECK_MS);
    return () => clearTimeout(timer);
  }, [hasUploadingChunks, isLive, now, refetch]);
  if (isOverByteBudget && !isPlaceholderData && !isPausedForBudget) pauseForBudget();
  const isLoadError = isError && !data;

  const isEnabled = pages?.[0]?.sessionLogs.enabled ?? false;
  const isRecordable = pages?.[0]?.sessionLogs.isRecordable ?? true;
  // Nothing new can arrive while session logs are off or for a session that can't be recorded, so the panel
  // doesn't go live, and an ended session doesn't promise logs that won't come.
  const isWatching = isLive && isEnabled && isRecordable;
  let liveState: LiveState | null = null;
  if (canTail && isPausedForBudget) liveState = "paused";
  else if (isWatching && live.isError) liveState = "reconnecting";
  else if (isWatching && !isActive) liveState = "ended";
  else if (isWatching) liveState = "live";
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);
  // Only without data: a failed reload or older page keeps the rows already on screen.
  const storageError = data ? null : getSessionLogStorageError(history.error);

  const visible = useMemo(
    () =>
      records.filter((record) => {
        if (range) {
          const at = Date.parse(record.ts);
          if (at < range.startDate.getTime() || at > range.endDate.getTime()) return false;
        }
        if (decisionFilter !== "all" && record.decision !== decisionFilter) return false;
        return matchesSessionLogSearch(record, search);
      }),
    [records, search, decisionFilter, range]
  );

  const hasBrowserFilter = Boolean(sessionLogSearchTerm(search)) || decisionFilter !== "all";
  const isFiltered = hasBrowserFilter || Boolean(range);

  // Counted once opened: a chunk's request count isn't known until it is decrypted.
  const { searched, emptyRun, oldestChunkAt } = useMemo(
    () =>
      (data?.pages ?? []).reduce(
        (totals, page) => {
          const opened = page.chunks.reduce(
            (sum, chunk) => sum + (page.decrypted[sessionLogChunkKey(chunk)]?.records.length ?? 0),
            0
          );
          const lastRequestTimes = page.chunks.map((chunk) => chunkIdTime(chunk.chunkId).getTime());
          return {
            searched: totals.searched + opened,
            emptyRun: opened ? 0 : totals.emptyRun + 1,
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
    decisionFilter,
    range?.startDate.getTime(),
    range?.endDate.getTime()
  ].join("|");
  const nextAllowance = () => ({
    filterKey,
    until: searched + FILTER_SEARCH_STEP,
    pagesAt: loadedPages
  });
  const [allowance, setAllowance] = useState(nextAllowance);
  // Not while a new range's placeholder still shows the old range's pages, or the counts start from those.
  if (!isPlaceholderData && allowance.filterKey !== filterKey) setAllowance(nextAllowance());
  const searchOlder = () => setAllowance(nextAllowance());
  // Empty pages only count since the last allowance, so Search Older Requests always walks further.
  const isSearchPaused =
    Boolean(hasNextPage) &&
    !isTruncated &&
    ((hasBrowserFilter && searched >= allowance.until) ||
      Math.min(emptyRun, loadedPages - allowance.pagesAt) >= EMPTY_PAGE_STEP);
  const isFirstPageLoaded = Boolean(data?.pages.length) && !isPlaceholderData;

  const lastPage = data?.pages[data.pages.length - 1];
  const searchedBackTo =
    lastPage?.nextCursor && oldestChunkAt !== null ? new Date(oldestChunkAt) : null;

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
    // Not cancelRefetch, so this walk can't cancel a Reload in flight.
    if (isFirstPageLoaded && lastVisibleIndex >= visible.length - 30)
      fetchNextPage({ cancelRefetch: false }).catch(() => {});
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
  } else if (gaps.length > 0 && records.length === 0 && !hasNextPage) {
    noRecordsTitle = "Session logs unavailable";
    noRecordsDescription = "None of this session's logs could be loaded.";
  } else if (isSearchPaused && searchedBackTo) {
    noRecordsTitle = `No ${hasBrowserFilter ? "matching" : "readable"} requests since ${format(
      searchedBackTo,
      "MMM d, h:mm a"
    )}`;
    noRecordsDescription = "Older requests have not been searched yet.";
  } else if (isSearchPaused) {
    noRecordsTitle = `No ${hasBrowserFilter ? "matching" : "readable"} requests found yet`;
    noRecordsDescription = "Older requests have not been searched yet.";
  } else if (range && (!hasChunks || !hasBrowserFilter)) {
    noRecordsTitle = "No requests in this range";
    noRecordsDescription = `This session recorded nothing between ${format(
      range.startDate,
      "MMM d, yyyy HH:mm"
    )} and ${format(range.endDate, "MMM d, yyyy HH:mm")}.`;
  } else if (isFiltered) {
    noRecordsTitle = "No requests match these filters";
    noRecordsDescription = "Try a different search term, outcome or time range.";
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
      : "";
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

  if (storageError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Session logs can&apos;t be read</EmptyTitle>
          <EmptyDescription>{storageError}</EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          {retryButton}
          {isAdmin && (
            <Button variant="av" asChild>
              <Link
                to="/organizations/$orgId/agent-vault/settings"
                params={{ orgId: currentOrg.id }}
              >
                Go to Settings
              </Link>
            </Button>
          )}
        </div>
      </Empty>
    );
  }

  // Only a running session is offered Settings or an upgrade; turning logs on can't record one that ended.
  if (
    !isPending &&
    !isPlaceholderData &&
    !isLoadError &&
    isActive &&
    !isEnabled &&
    !hasChunks &&
    !range
  ) {
    if (!subscription.agentVaultByoS3) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Session logs aren&apos;t on your plan</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? "Upgrade to record what your agents reach."
                : "Ask an Agent Vault administrator about upgrading."}
            </EmptyDescription>
          </EmptyHeader>
          {isAdmin && (
            <Button variant="av" onClick={() => setIsUpgradeOpen(true)}>
              Upgrade
            </Button>
          )}
          <AgentVaultSessionLogUpgradeModal
            isOpen={isUpgradeOpen}
            onOpenChange={setIsUpgradeOpen}
          />
        </Empty>
      );
    }

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

  if (
    !isPending &&
    !isPlaceholderData &&
    !isLoadError &&
    isActive &&
    isEnabled &&
    !isRecordable &&
    !hasChunks
  ) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Session logs aren&apos;t available for this session</EmptyTitle>
          <EmptyDescription>
            To record requests, create a new session and run it through a proxy on the latest
            Infisical CLI.
          </EmptyDescription>
        </EmptyHeader>
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
          size="md"
          isActive={Boolean(range)}
          inactiveLabel="Entire Session"
          showTimezoneToggle={false}
          earliestDate={new Date(session.createdAt)}
          showRelativeRanges={isActive}
          onChange={(result) => applyRange(result)}
          onClear={() => applyRange(null)}
        />
      </div>

      {isUnreachable && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <div className="flex flex-col gap-1">
              <p>
                None of this session&apos;s logs could be downloaded from the bucket. The
                bucket&apos;s CORS rule may not allow this origin, or this network may block the
                bucket.
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
              {groupSessionLogGaps(gaps).map(({ reason, chunkCount }) => (
                <span key={reason}>
                  {chunkCount.toLocaleString()} {chunkCount === 1 ? "batch" : "batches"} of requests{" "}
                  {GAP_EXPLANATION[reason][chunkCount === 1 ? "one" : "many"]}.
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
          className="w-full min-w-240 table-fixed"
          containerClassName="min-h-0 thin-scrollbar overflow-auto [overflow-anchor:none]"
        >
          <TableHeader sticky>
            <TableRow>
              <TableHead className="w-48">Time</TableHead>
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
                columnCount={COLUMN_COUNT}
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
              const record = visible[virtualRow.index];
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
                <TableCell colSpan={COLUMN_COUNT} className="text-center text-xs text-muted">
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
