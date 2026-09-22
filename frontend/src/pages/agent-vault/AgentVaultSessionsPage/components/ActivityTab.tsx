import {
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { format } from "date-fns";
import { AlertTriangleIcon, SearchIcon, XIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

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
  AgentVaultActivityDecision,
  AgentVaultSessionStatus,
  useDecryptedAgentVaultActivity,
  useGetAgentVaultSessionActivity
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultActivityGapReason,
  TAgentVaultActivityRecord,
  TAgentVaultSession
} from "@app/hooks/api/agentVault/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

const ALL_PROXIES = "all";

/** How long a new row holds its tint before fading back, in ms. Long enough to catch the eye. */
const ARRIVAL_HOLD_MS = 1200;

/**
 * Mounts tinted and drops the tint after a hold, so what animates is the fade back to normal. Done
 * per row rather than on one timer for the batch: rows are virtualised, so most of a new page is not
 * mounted when it arrives, and a batch timer would have expired before the viewer scrolled to them.
 */
const ArrivingRow = ({
  arrivalKey,
  isArriving,
  onShown,
  children
}: {
  arrivalKey: string;
  isArriving: boolean;
  onShown: (key: string) => void;
  children: ReactNode;
}) => {
  // `onShown` has to be a stable reference: an inline closure would change on every parent render,
  // and each row settling re-renders the parent, so the timers would keep resetting one another.
  useEffect(() => {
    if (!isArriving) return undefined;
    const timer = setTimeout(() => onShown(arrivalKey), ARRIVAL_HOLD_MS);
    return () => clearTimeout(timer);
  }, [isArriving, arrivalKey, onShown]);

  return (
    <TableRow
      className={twMerge("transition-colors duration-700", isArriving && "bg-surface-active")}
    >
      {children}
    </TableRow>
  );
};

/** Single-line rows, so a fixed estimate is exact and the virtualiser never has to remeasure. */
const ACTIVITY_ROW_HEIGHT = 41;

/** Stable per record: seq is unique within a proxy, and ts separates two proxies' streams. */
const recordKey = (record: TAgentVaultActivityRecord) =>
  `${record.proxyId}-${record.seq}-${record.ts}`;

type DecisionFilter = "all" | AgentVaultActivityDecision;

// Module scope, as SessionStatusBadge does it, so the map is not rebuilt on every render.
const DECISION_PRESENTATION: Record<
  AgentVaultActivityDecision,
  { label: string; variant: "success" | "neutral" | "warning" | "danger" }
> = {
  [AgentVaultActivityDecision.Brokered]: { label: "Brokered", variant: "success" },
  [AgentVaultActivityDecision.Passthrough]: { label: "Passthrough", variant: "neutral" },
  [AgentVaultActivityDecision.Blocked]: { label: "Blocked", variant: "warning" },
  [AgentVaultActivityDecision.Error]: { label: "Error", variant: "danger" }
};

/**
 * Records come out of the customer's encrypted blob, so the server never sees the decision and cannot
 * validate it. A proxy from a newer CLI release can write one this build has no entry for, and the
 * CLI ships separately from the platform. Rendering the raw value keeps that to one odd-looking row
 * rather than throwing partway through the table and blanking the whole timeline.
 */
const decisionPresentation = (decision: AgentVaultActivityDecision) =>
  DECISION_PRESENTATION[decision] ?? { label: decision || "Unknown", variant: "neutral" as const };

const GAP_EXPLANATION: Record<TAgentVaultActivityGapReason, string> = {
  repointed: "Stored in a bucket this project no longer uses",
  fetch: "Could not be read from the bucket",
  size: "The stored object is the wrong size",
  gcm: "Could not be decrypted",
  json: "The decrypted contents were not readable"
};

const statusTone = (status: number) => {
  if (status >= 500) return "text-danger";
  if (status >= 400) return "text-warning";
  if (status === 0) return "text-muted";
  return "text-foreground";
};

type Props = {
  session: TAgentVaultSession;
};

export const ActivityTab = ({ session }: Props) => {
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>("all");
  const [proxyFilter, setProxyFilter] = useState(ALL_PROXIES);
  // Undefined means "newest first", so opening a quiet session still shows its last activity
  // rather than an empty window the viewer has to widen before anything appears.
  const [range, setRange] = useState<DateRangeFilterResult | null>(null);
  const [rangeKey, setRangeKey] = useState(0);
  const seenProxiesSessionId = useRef(session.id);

  const isActive = session.status === AgentVaultSessionStatus.Active;
  const { data, isPending, isFetching, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGetAgentVaultSessionActivity(session.id, {
      isActive,
      from: range?.startDate,
      to: range?.endDate
    });

  const pages = data?.pages;
  const { records, gaps, drops, isDecrypting, isTruncated } = useDecryptedAgentVaultActivity(
    pages,
    session.id
  );

  const isEnabled = pages?.[0]?.enabled ?? false;
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);

  // Every filter and every count below is computed from records already decrypted in this browser, so
  // none of it costs an extra request.
  const seenProxies = useRef(new Map<string, string>());
  if (seenProxiesSessionId.current !== session.id) {
    seenProxies.current = new Map();
    seenProxiesSessionId.current = session.id;
  }
  // First write wins, and pages run newest first, so a renamed proxy is listed under the name its
  // most recent chunk carried rather than the one it had when the session started.
  (pages ?? []).forEach((page) =>
    page.chunks.forEach((chunk) => {
      if (!seenProxies.current.has(chunk.proxyId)) {
        seenProxies.current.set(chunk.proxyId, chunk.proxyName ?? chunk.proxyId);
      }
    })
  );
  const proxies = [...seenProxies.current.entries()].map(([id, name]) => ({ id, name }));

  const bundleHosts = useMemo(
    () => new Set(records.filter((r) => r.service).map((r) => r.host)),
    [records]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
      // The server matches any chunk overlapping the window, so a chunk straddling an edge brings
      // records from outside it. Without this the table shows times the viewer did not ask for.
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

  const isFiltered =
    Boolean(search.trim()) ||
    decisionFilter !== "all" ||
    proxyFilter !== ALL_PROXIES ||
    Boolean(range);

  const isLive = isActive;

  // Which rows arrived since the last settled render, so a poll bringing new activity is visible
  // rather than silently reflowing the table.
  const seenRecords = useRef(new Set<string>());
  const hasSettled = useRef(false);
  const hasDecrypted = useRef(false);
  const hasResolvedOnce = useRef(false);
  const animatedSessionId = useRef(session.id);
  // Reset during render rather than in an effect: an effect keyed on session.id runs *after* the
  // seeding effect below, so on mount it would wipe the seed and animate the whole table.
  if (animatedSessionId.current !== session.id) {
    animatedSessionId.current = session.id;
    seenRecords.current = new Set();
    hasSettled.current = false;
    hasDecrypted.current = false;
    hasResolvedOnce.current = false;
  }

  const [arrivedKeys, setArrivedKeys] = useState<Set<string>>(new Set());
  const markArrivalShown = useCallback((key: string) => {
    setArrivedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Scrolling keeps appending pages, so a long session ends up with thousands of rows in memory. The
  // v3 Table has no virtualiser of its own, so the rows are windowed here: spacer rows above and below
  // keep the scrollbar honest while only the visible slice is mounted.
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
    // `isDecrypting` is the load-bearing guard. A page's records appear chunk by chunk, so partway
    // through the first one `visible` is briefly a handful of rows, the test below reads as "the
    // viewer is at the end", and every page of the session's history gets pulled in a cascade.
    if (!hasNextPage || isFetchingNextPage || isDecrypting || isTruncated) return;
    // One screen of slack, so the next page is already in flight by the time the viewer arrives.
    if (visible.length > 0 && lastVisibleIndex >= visible.length - 30)
      fetchNextPage().catch(() => {});
  }, [
    lastVisibleIndex,
    visible.length,
    hasNextPage,
    isFetchingNextPage,
    isDecrypting,
    isTruncated,
    fetchNextPage
  ]);
  // Time, Method, Host, Path, Status, Outcome, Service and the live indicator, plus Proxy when the
  // session used more than one.
  const columnCount = proxies.length > 1 ? 9 : 8;
  const overflows = rowVirtualizer.getTotalSize() > (rowVirtualizer.scrollRect?.height ?? Infinity);
  // A poll inserts the newest requests above whatever the viewer is reading, which would slide the
  // page down under their eyes. Scrolling by the height of what was inserted keeps the same rows
  // where they were. Only when scrolled away from the top: at the top, watching new rows push the
  // list down is the point of a live view.
  const previousFirstKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const firstKey = visible.length ? recordKey(visible[0]) : null;
    const previous = previousFirstKey.current;
    previousFirstKey.current = firstKey;

    if (!scroller || !previous || firstKey === previous || scroller.scrollTop === 0) return;
    const inserted = visible.findIndex((record) => recordKey(record) === previous);
    if (inserted > 0) scroller.scrollTop += inserted * ACTIVITY_ROW_HEIGHT;
  }, [visible]);

  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  // `isDecrypting` is false *before* decryption begins as well as after, so settling on it alone
  // settles on the empty first render and then treats every decrypted batch as new activity.
  if (isDecrypting) hasDecrypted.current = true;

  useEffect(() => {
    // Settled means: decryption ran and finished, or there was nothing to decrypt. The second half
    // matters — a session with no records yet must settle immediately, or the first requests to
    // arrive are exactly the ones that never get marked. Gated on isPending because before the
    // first response there are no chunks either, and settling there calls the whole load new.
    if (isPending || isDecrypting || !(hasDecrypted.current || !hasChunks)) return undefined;

    const fresh = hasSettled.current
      ? records.map(recordKey).filter((key) => !seenRecords.current.has(key))
      : [];
    records.forEach((record) => seenRecords.current.add(recordKey(record)));
    hasSettled.current = true;

    if (!fresh.length) return undefined;

    setArrivedKeys(new Set(fresh));
    return undefined;
  }, [records, isPending, isDecrypting, hasChunks]);

  // The chunk index arrives long before the records do: the browser still has to fetch every object
  // from S3 and decrypt it. Until that finishes there is nothing in `records`, and saying "nothing
  // to show" then is a confident claim made before anything has been read.
  //
  // Only the first pass, though. Chunks that failed are retried on every poll, so a session whose
  // activity cannot be read would otherwise alternate between this and the failure every few
  // seconds, advertising a retry the viewer can do nothing with.
  // The same test the arrival effect uses, and for the same reason: `isDecrypting` is false before
  // decryption begins as well as after, so settling on it alone marks the load done on the render
  // that carried the index, while every chunk is still being fetched.
  if (!isPending && !isDecrypting && (hasDecrypted.current || !hasChunks))
    hasResolvedOnce.current = true;
  const isOpening =
    !hasResolvedOnce.current &&
    (isDecrypting || (isFetching && !isFetchingNextPage)) &&
    visible.length === 0;

  let noRecordsTitle: string;
  let noRecordsDescription: string;
  if (isOpening) {
    noRecordsTitle = "Loading requests";
    noRecordsDescription = "";
  } else if (range && !hasChunks) {
    noRecordsTitle = "No activity in this range";
    noRecordsDescription = `This session recorded nothing between ${format(
      range.startDate,
      "MMM d, yyyy HH:mm"
    )} and ${format(range.endDate, "MMM d, yyyy HH:mm")}.`;
  } else if (isFiltered) {
    noRecordsTitle = "No requests match these filters";
    noRecordsDescription = "Try a different search term, outcome, proxy or time range.";
  } else if (!hasChunks) {
    // "Yet" and "appear here" are promises about a session that is still running. A retired one
    // will never make another request, so the same sentence there is simply false.
    noRecordsTitle = isActive ? "Nothing recorded yet" : "No activity recorded";
    noRecordsDescription = isActive
      ? "Requests this session makes through a proxy will appear here shortly after."
      : "This session ended without making any requests through a proxy.";
  } else {
    noRecordsTitle = "Activity unavailable";
    noRecordsDescription = "None of this session's activity could be loaded.";
  }

  const isUnreachable =
    gaps.length > 0 && records.length === 0 && gaps.every((gap) => gap.reason === "fetch");

  // Only a product nobody has set up takes the whole tab: there is nothing to search, and the one
  // useful thing on screen is the way to turn it on. A session that simply has not recorded anything
  // yet keeps its filters, so the controls do not appear from nowhere when the first request lands.
  //
  // Never while pending: there are no chunks before the first response either, and this branch would
  // call logging off. Never with a window set: returning a different tree unmounts the date picker,
  // which both shifts the layout and resets the picker's own label back to its default.
  if (!isPending && !isEnabled && !hasChunks && !range) {
    // An admin can fix this themselves; a member can only be told who to ask. The old copy told
    // everyone that "an administrator can turn it on", which reads as a shrug to the very person
    // holding the switch.
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
        {/* h-9 to match the selects either side: the picker's own trigger is size="sm" (h-8), which
            leaves it sitting short in a row of h-9 controls. Not a ButtonGroup — the picker renders
            its button inside a popover trigger, so the group's radius rules never reach it and the
            join renders as two separate boxes with a gap. */}
        <DateRangeFilter
          key={rangeKey}
          accent="av"
          className="h-9"
          isActive={Boolean(range)}
          onChange={(result) => setRange(result)}
        />
        {range && (
          <IconButton
            variant="ghost"
            aria-label="Clear time range"
            onClick={() => {
              setRange(null);
              setRangeKey((key) => key + 1);
            }}
          >
            <XIcon />
          </IconButton>
        )}
        {/* Always present, like the other filters. Which proxies a session used is only known from
            the chunks loaded so far, so gating the control on that made it appear mid-scroll on some
            sessions and never on others. */}
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

      {/* Every chunk failing to download, with none readable, is the signature of a missing CORS
          rule: the browser fetches these objects itself, so the bucket has to allow this origin.
          One chunk failing alone is an expired URL or a missing object, which the per-chunk list
          covers. This is also the only place a member ever finds out. */}
      {isUnreachable && (
        <Alert variant="warning">
          <AlertDescription>
            <p>
              None of this session&apos;s activity could be read from the bucket. The bucket has to
              allow requests from this origin.
            </p>
            {isAdmin ? (
              <AlertAction>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/organizations/$orgId/agent-vault/activity-logs"
                    params={{ orgId: currentOrg.id }}
                  >
                    Go to Activity Logs
                  </Link>
                </Button>
              </AlertAction>
            ) : (
              <p>Ask an Agent Vault administrator to check the bucket&apos;s CORS rule.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {!isUnreachable && gaps.length > 0 && (
        <Alert variant="warning">
          <AlertDescription className="flex flex-col gap-1">
            {gaps.slice(0, 5).map((gap) => (
              <span key={gap.chunkId}>
                {gap.recordCount} {gap.recordCount === 1 ? "request" : "requests"} from{" "}
                {gap.proxyName ?? gap.proxyId} around{" "}
                {format(new Date(gap.startedAt), "MMM d, h:mm a")} cannot be shown.{" "}
                {GAP_EXPLANATION[gap.reason]}.
              </span>
            ))}
            {gaps.length > 5 && <span>and {gaps.length - 5} more.</span>}
          </AlertDescription>
        </Alert>
      )}

      {drops.length > 0 && (
        <div className="rounded-md border border-border bg-container px-3 py-2 text-xs text-muted">
          {drops.reduce((total, drop) => total + drop.droppedCount, 0)} requests were not recorded,
          because a proxy&apos;s buffer filled or recording was paused.
        </div>
      )}

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            {isOpening && <Spinner size="sm" />}
            <EmptyTitle>{noRecordsTitle}</EmptyTitle>
            {noRecordsDescription && <EmptyDescription>{noRecordsDescription}</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        // The scroller is the table's own container, not a wrapper around it: the container is
        // `overflow-x-auto` for wide rows, which makes it the scrollport a sticky header resolves
        // against, so a header inside a wrapper would never stick.
        <Table ref={scrollRef} containerClassName="min-h-0 thin-scrollbar flex-1 overflow-auto">
          {/* Sticky so the column names, and the live indicator beside them, stay put while the
                viewer scrolls back through the session. */}
          <TableHeader className="sticky top-0 z-10 bg-container">
            <TableRow>
              <TableHead>Time</TableHead>
              {proxies.length > 1 && <TableHead>Proxy</TableHead>}
              <TableHead>Method</TableHead>
              <TableHead>Host</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Service</TableHead>
              <TableHead className="whitespace-nowrap">
                {isLive && (
                  <span className="flex items-center gap-1.5 text-success">
                    <span
                      aria-hidden
                      className="size-1.5 shrink-0 animate-pulse rounded-full bg-current"
                    />
                    Live
                  </span>
                )}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {padTop > 0 && <tr style={{ height: padTop }} />}
            {virtualRows.map((virtualRow) => {
              const record = visible[virtualRow.index] as TAgentVaultActivityRecord;
              const presentation = decisionPresentation(record.decision);
              return (
                <ArrivingRow
                  key={recordKey(record)}
                  arrivalKey={recordKey(record)}
                  isArriving={arrivedKeys.has(recordKey(record))}
                  onShown={markArrivalShown}
                >
                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="font-mono text-xs whitespace-nowrap">
                          {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss")}
                        </span>
                      </TooltipTrigger>
                      {/* The record's `ts` is UTC ISO; date-fns renders a Date in the viewer's own
                            zone, so the column is already local. The tooltip adds the milliseconds,
                            which is what separates two requests inside the same second. */}
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
                    <span className="flex items-center gap-1 text-sm">
                      {record.host}
                      {!bundleHosts.has(record.host) && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangleIcon className="size-3 text-warning" />
                          </TooltipTrigger>
                          <TooltipContent>No access bundle covers this host.</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
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
                  <TableCell className="text-xs text-muted">{record.service ?? "—"}</TableCell>
                  <TableCell />
                </ArrivingRow>
              );
            })}
            {padBottom > 0 && <tr style={{ height: padBottom }} />}
            {/* A row of the table, so it sits with the last request rather than under the box. The
                  end marker also waits for the list to overflow: a session that fits on one screen
                  needs no telling. */}
            {(isFetchingNextPage || (!hasNextPage && overflows)) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="text-center text-xs text-muted">
                  {isFetchingNextPage ? (
                    <span className="flex items-center justify-center gap-2">
                      <Spinner size="xs" />
                      Loading more
                    </span>
                  ) : (
                    "No more requests"
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}

      {isTruncated && (
        <p className="text-xs text-muted">
          Showing the most recent 100,000 requests. Narrow the search to see further back.
        </p>
      )}
    </div>
  );
};
