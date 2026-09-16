import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { AlertTriangleIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
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

  const isActive = session.status === AgentVaultSessionStatus.Active;
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useGetAgentVaultSessionActivity(session.id, { isActive });

  const pages = data?.pages;
  const { records, gaps, drops, isDecrypting, isTruncated } = useDecryptedAgentVaultActivity(
    pages,
    session.id
  );

  const isEnabled = pages?.[0]?.enabled ?? false;
  const hasChunks = (pages ?? []).some((page) => page.chunks.length > 0);

  // Every filter and every count below is computed from records already decrypted in this browser, so
  // none of it costs an extra request.
  const proxies = useMemo(() => {
    const byId = new Map<string, string>();
    (pages ?? []).forEach((page) =>
      page.chunks.forEach((chunk) => byId.set(chunk.proxyId, chunk.proxyName ?? chunk.proxyId))
    );
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [pages]);

  const bundleHosts = useMemo(
    () => new Set(records.filter((r) => r.service).map((r) => r.host)),
    [records]
  );

  const summary = useMemo(() => {
    const hosts = new Map<string, number>();
    let blocked = 0;
    let errors = 0;
    records.forEach((record) => {
      hosts.set(record.host, (hosts.get(record.host) ?? 0) + 1);
      if (record.decision === AgentVaultActivityDecision.Blocked) blocked += 1;
      if (record.decision === AgentVaultActivityDecision.Error) errors += 1;
    });
    return {
      total: records.length,
      blocked,
      errors,
      hosts: [...hosts.entries()].sort((a, b) => b[1] - a[1])
    };
  }, [records]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return records.filter((record) => {
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
  }, [records, search, decisionFilter, proxyFilter]);

  const isFiltered =
    Boolean(search.trim()) || decisionFilter !== "all" || proxyFilter !== ALL_PROXIES;

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          // eslint-disable-next-line react/no-array-index-key
          <Skeleton key={`activity-skeleton-${index}`} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!hasChunks) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{isEnabled ? "Nothing recorded yet" : "Activity logging is off"}</EmptyTitle>
          <EmptyDescription>
            {isEnabled
              ? "Requests this session makes through a proxy appear here within a minute."
              : "This organization does not store session activity. An administrator can turn it on under Settings."}
          </EmptyDescription>
        </EmptyHeader>
        {!isEnabled && isAdmin && (
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-container px-3 py-2.5">
        <p className="text-sm">
          {summary.total} {summary.total === 1 ? "request" : "requests"} · {summary.hosts.length}{" "}
          {summary.hosts.length === 1 ? "host" : "hosts"}
          {summary.blocked > 0 && ` · ${summary.blocked} blocked`}
          {summary.errors > 0 && ` · ${summary.errors} failed`}
          {isDecrypting && " · reading…"}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {summary.hosts.slice(0, 8).map(([host, count]) => (
            <span key={host} className="flex items-center gap-1">
              {host} {count}
              {!bundleHosts.has(host) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertTriangleIcon className="size-3 text-warning" />
                  </TooltipTrigger>
                  <TooltipContent>
                    No access bundle covers this host, so no credential was attached.
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
          ))}
        </div>
      </div>

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
        {proxies.length > 1 && (
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
        )}
      </div>

      {gaps.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
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
            <EmptyTitle>
              {isFiltered ? "No requests match these filters" : "Nothing to show"}
            </EmptyTitle>
            <EmptyDescription>
              {isFiltered
                ? "Try a different search term, outcome or proxy."
                : "Every chunk recorded for this session is currently unreadable."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        // The v3 Table has no virtualiser, so the page size is what keeps the DOM small. If a page ever
        // proves too heavy, lower the request limit rather than swapping the table.
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                {proxies.length > 1 && <TableHead>Proxy</TableHead>}
                <TableHead>Method</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Service</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((record: TAgentVaultActivityRecord) => {
                const presentation = DECISION_PRESENTATION[record.decision];
                return (
                  <TableRow key={`${record.proxyId}-${record.seq}-${record.ts}`}>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono text-xs whitespace-nowrap">
                            {format(new Date(record.ts), "HH:mm:ss")}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          {format(new Date(record.ts), "MMM d, yyyy HH:mm:ss.SSS")}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    {proxies.length > 1 && (
                      <TableCell className="text-xs text-muted">
                        {proxies.find((proxy) => proxy.id === record.proxyId)?.name ??
                          record.proxyId}
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
                      <span
                        className="block max-w-80 truncate font-mono text-xs"
                        title={record.path}
                      >
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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {isTruncated ? (
        <p className="text-xs text-muted">
          Showing the most recent 100,000 requests. Narrow the search to see further back.
        </p>
      ) : (
        hasNextPage && (
          <Button
            variant="outline"
            className="self-start"
            isPending={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            Load more
          </Button>
        )
      )}
    </div>
  );
};
