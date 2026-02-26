import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ClockIcon,
  FilterIcon,
  PlayIcon,
  Trash2Icon,
  XCircleIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useInfraRuns } from "@app/hooks/api/infra";
import { TInfraRun, TPlanJson } from "@app/hooks/api/infra/types";

// ── Helpers ──

const statusVariant = (status: string): "success" | "danger" | "warning" | "info" => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
      return "danger";
    case "running":
    case "awaiting_approval":
      return "warning";
    default:
      return "info";
  }
};

const statusIcon = (status: string) => {
  switch (status) {
    case "success":
      return <CheckCircle2Icon className="size-3.5 text-green-500" />;
    case "failed":
      return <XCircleIcon className="size-3.5 text-red-500" />;
    case "running":
      return <PlayIcon className="size-3.5 animate-pulse text-yellow-400" />;
    case "awaiting_approval":
      return <AlertTriangleIcon className="size-3.5 text-yellow-400" />;
    default:
      return null;
  }
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
};

const formatAbsoluteDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
};

// ── Animation helpers ──

const useCountUp = (end: number, duration = 1200) => {
  const [value, setValue] = useState(0);
  const prevEnd = useRef(0);
  useEffect(() => {
    if (end === prevEnd.current) return;
    const start = prevEnd.current;
    prevEnd.current = end;
    const startTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration]);
  return value;
};

const AnimatedNumber = ({ value }: { value: number }) => {
  const display = useCountUp(value);
  return <span>{display}</span>;
};

const GrowIn = ({
  children,
  delay = 0,
  className
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1) translateY(0)" : "scale(0.92) translateY(8px)",
        transition:
          "opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)"
      }}
    >
      {children}
    </div>
  );
};

const AnimatedBar = ({ percent, className }: { percent: number; className?: string }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(percent));
    return () => cancelAnimationFrame(raf);
  }, [percent]);
  return (
    <div
      className={className}
      style={{ width: `${width}%`, transition: "width 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
    />
  );
};

// ── Filter types ──

type RunFilter = "all" | "apply" | "plan" | "destroy";

const FILTERS: { key: RunFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "apply", label: "Apply" },
  { key: "plan", label: "Plan" },
  { key: "destroy", label: "Destroy" }
];

// ── Change bar (inline resource change mini visualization) ──

const ChangeBar = ({ plan }: { plan: TPlanJson }) => {
  const total = plan.add + plan.change + plan.destroy;
  if (total === 0) return <span className="text-xs text-mineshaft-600">no changes</span>;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-mineshaft-700">
        {plan.add > 0 && (
          <div className="h-full bg-green-500" style={{ width: `${(plan.add / total) * 100}%` }} />
        )}
        {plan.change > 0 && (
          <div
            className="h-full bg-yellow-500"
            style={{ width: `${(plan.change / total) * 100}%` }}
          />
        )}
        {plan.destroy > 0 && (
          <div
            className="h-full bg-red-500"
            style={{ width: `${(plan.destroy / total) * 100}%` }}
          />
        )}
      </div>
      <span className="flex items-center gap-1.5 text-xs">
        {plan.add > 0 && <span className="text-green-400">+{plan.add}</span>}
        {plan.change > 0 && <span className="text-yellow-400">~{plan.change}</span>}
        {plan.destroy > 0 && <span className="text-red-400">-{plan.destroy}</span>}
      </span>
    </div>
  );
};

// ── Main Component ──

export const InfraRunsPage = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: runs, isLoading } = useInfraRuns(currentProject.id);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RunFilter>("all");

  const visibleRuns = useMemo(() => {
    if (!runs) return null;
    return runs.filter((r) => r.status !== "denied");
  }, [runs]);

  const filteredRuns = useMemo(() => {
    if (!visibleRuns) return null;
    if (filter === "all") return visibleRuns;
    return visibleRuns.filter((r) => r.type === filter);
  }, [visibleRuns, filter]);

  // Stats — exclude plans from success rate and resource changes since plans don't mutate state
  const stats = useMemo(() => {
    if (!visibleRuns) return null;
    const total = visibleRuns.length;
    const applies = visibleRuns.filter((r) => r.type === "apply").length;
    const plans = visibleRuns.filter((r) => r.type === "plan").length;
    const destroys = visibleRuns.filter((r) => r.type === "destroy").length;

    // Success rate only counts runs that actually mutate state (apply/destroy)
    const mutatingRuns = visibleRuns.filter((r) => r.type !== "plan");
    const mutatingTotal = mutatingRuns.length;
    const success = mutatingRuns.filter((r) => r.status === "success").length;
    const failed = mutatingRuns.filter((r) => r.status === "failed").length;
    const successRate = mutatingTotal > 0 ? Math.round((success / mutatingTotal) * 100) : 0;

    const running = visibleRuns.filter((r) => r.status === "running").length;
    const awaiting = visibleRuns.filter((r) => r.status === "awaiting_approval").length;

    // Resource changes only from apply/destroy runs
    let totalAdds = 0;
    let totalChanges = 0;
    let totalDestroys = 0;
    mutatingRuns.forEach((r) => {
      const p = r.planJson as TPlanJson | null;
      if (p) {
        totalAdds += p.add;
        totalChanges += p.change;
        totalDestroys += p.destroy;
      }
    });

    return {
      total,
      success,
      failed,
      running,
      awaiting,
      successRate,
      mutatingTotal,
      applies,
      plans,
      destroys,
      totalAdds,
      totalChanges,
      totalDestroys
    };
  }, [visibleRuns]);

  const handleRowClick = (runId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/infra/$projectId/run/$runId",
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id,
        runId
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-mineshaft-100">Runs</h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          History of all plan, apply, and destroy operations.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <GrowIn delay={0}>
          <UnstableCard className="h-full">
            <UnstableCardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Total Runs</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                  {isLoading ? (
                    <Skeleton className="inline-block h-7 w-10" />
                  ) : (
                    <AnimatedNumber value={stats?.total ?? 0} />
                  )}
                </p>
                {!isLoading && stats && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-mineshaft-500">
                    <span>{stats.applies} apply</span>
                    <span>{stats.plans} plan</span>
                    {stats.destroys > 0 && (
                      <span className="text-red-400">{stats.destroys} destroy</span>
                    )}
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-primary">
                <PlayIcon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>

        <GrowIn delay={60}>
          <UnstableCard className="h-full">
            <UnstableCardContent>
              <div className="flex justify-between">
                <div className="flex-1">
                  <p className="text-xs font-medium text-mineshaft-400">Success Rate</p>
                  <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                    {isLoading ? (
                      <Skeleton className="inline-block h-7 w-14" />
                    ) : (
                      <>
                        <AnimatedNumber value={stats?.successRate ?? 0} />%
                      </>
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-green-400">
                  <CheckCircle2Icon className="size-5" />
                </div>
              </div>
              {!isLoading && stats && stats.mutatingTotal > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-red-500/30">
                    <AnimatedBar
                      percent={stats.successRate}
                      className="h-full rounded-full rounded-r-none bg-green-500"
                    />
                  </div>
                  <span className="text-xs text-mineshaft-500">
                    {stats.success}/{stats.mutatingTotal}
                  </span>
                </div>
              )}
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>

        <GrowIn delay={120}>
          <UnstableCard className="h-full">
            <UnstableCardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Resource Changes</p>
                {isLoading ? (
                  <Skeleton className="mt-1 h-7 w-28" />
                ) : stats ? (
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-green-400">
                      +<AnimatedNumber value={stats.totalAdds} />
                    </span>
                    <span className="text-lg font-bold text-yellow-400">
                      ~<AnimatedNumber value={stats.totalChanges} />
                    </span>
                    <span className="text-lg font-bold text-red-400">
                      -<AnimatedNumber value={stats.totalDestroys} />
                    </span>
                  </div>
                ) : null}
                <p className="mt-0.5 text-xs text-mineshaft-500">from apply & destroy runs</p>
              </div>
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>

        <GrowIn delay={180}>
          <UnstableCard className="h-full">
            <UnstableCardContent className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">Active</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                  {isLoading ? (
                    <Skeleton className="inline-block h-7 w-8" />
                  ) : (
                    <AnimatedNumber value={(stats?.running ?? 0) + (stats?.awaiting ?? 0)} />
                  )}
                </p>
                {!isLoading && stats && (
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-mineshaft-500">
                    {stats.running > 0 && (
                      <span className="flex items-center gap-1 text-yellow-400">
                        <span className="inline-block size-1.5 animate-pulse rounded-full bg-yellow-400" />
                        {stats.running} running
                      </span>
                    )}
                    {stats.awaiting > 0 && (
                      <span className="text-yellow-400">{stats.awaiting} awaiting</span>
                    )}
                    {stats.running === 0 && stats.awaiting === 0 && <span>no active runs</span>}
                  </div>
                )}
              </div>
              <div
                className={twMerge(
                  "rounded-lg bg-mineshaft-700/50 p-2.5",
                  stats && (stats.running > 0 || stats.awaiting > 0)
                    ? "text-yellow-400"
                    : "text-mineshaft-500"
                )}
              >
                <ClockIcon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>
      </div>

      {/* Filter tabs + table */}
      {!isLoading && visibleRuns && visibleRuns.length > 0 && (
        <UnstableCard>
          <UnstableCardHeader className="flex flex-row items-center justify-between">
            <UnstableCardTitle className="flex items-center gap-2 text-sm font-medium text-mineshaft-200">
              <FilterIcon className="size-4 text-mineshaft-400" />
              Run History
            </UnstableCardTitle>
            <div className="flex gap-1">
              {FILTERS.map((f) => {
                const count =
                  f.key === "all"
                    ? visibleRuns.length
                    : visibleRuns.filter((r) => r.type === f.key).length;
                return (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={twMerge(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      filter === f.key
                        ? "bg-primary/20 text-primary"
                        : "text-mineshaft-400 hover:bg-mineshaft-700 hover:text-mineshaft-200"
                    )}
                  >
                    {f.label}
                    <span className="ml-1 text-[10px] opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>
          </UnstableCardHeader>
          <UnstableCardContent className="p-0">
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead className="w-10" />
                  <UnstableTableHead>Run</UnstableTableHead>
                  <UnstableTableHead>Type</UnstableTableHead>
                  <UnstableTableHead>Status</UnstableTableHead>
                  <UnstableTableHead>Changes</UnstableTableHead>
                  <UnstableTableHead>Time</UnstableTableHead>
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {filteredRuns?.map((run: TInfraRun) => {
                  const plan = run.planJson as TPlanJson | null;
                  return (
                    <UnstableTableRow
                      key={run.id}
                      className="cursor-pointer transition-colors hover:bg-mineshaft-700/30"
                      onClick={() => handleRowClick(run.id)}
                    >
                      <UnstableTableCell className="w-10 pr-0">
                        {statusIcon(run.status)}
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-mineshaft-200">
                            {run.id.slice(0, 8)}
                          </span>
                          {run.triggeredBy && (
                            <span className="text-[11px] text-mineshaft-500">
                              by {run.triggeredBy}
                            </span>
                          )}
                        </div>
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <Badge
                          variant={
                            run.type === "destroy"
                              ? "danger"
                              : run.type === "apply"
                                ? "success"
                                : "info"
                          }
                        >
                          {run.type === "destroy" && <Trash2Icon className="size-3" />}
                          {run.type}
                        </Badge>
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <Badge variant={statusVariant(run.status)}>
                          {run.status === "awaiting_approval" ? "awaiting approval" : run.status}
                        </Badge>
                      </UnstableTableCell>
                      <UnstableTableCell>
                        {plan ? (
                          <ChangeBar plan={plan} />
                        ) : (
                          <span className="text-xs text-mineshaft-600">—</span>
                        )}
                      </UnstableTableCell>
                      <UnstableTableCell>
                        <div className="flex flex-col">
                          <span className="flex items-center gap-1.5 text-xs text-mineshaft-300">
                            <ClockIcon className="size-3 text-mineshaft-500" />
                            {formatDate(run.createdAt)}
                          </span>
                          <span className="text-[11px] text-mineshaft-600">
                            {formatAbsoluteDate(run.createdAt)}
                          </span>
                        </div>
                      </UnstableTableCell>
                    </UnstableTableRow>
                  );
                })}
                {filteredRuns?.length === 0 && (
                  <UnstableTableRow>
                    <UnstableTableCell colSpan={6} className="py-8 text-center">
                      <p className="text-sm text-mineshaft-400">
                        No {filter === "all" ? "" : filter} runs found.
                      </p>
                    </UnstableTableCell>
                  </UnstableTableRow>
                )}
              </UnstableTableBody>
            </UnstableTable>
          </UnstableCardContent>
        </UnstableCard>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <UnstableCard>
          <UnstableCardContent className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </UnstableCardContent>
        </UnstableCard>
      )}

      {/* Empty state */}
      {!isLoading && (!visibleRuns || visibleRuns.length === 0) && (
        <UnstableCard>
          <UnstableCardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <div className="rounded-xl bg-mineshaft-700/50 p-4">
              <PlayIcon className="size-8 text-mineshaft-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-mineshaft-300">No runs yet</p>
              <p className="mt-1 text-xs text-mineshaft-500">
                Go to the Editor tab to run your first plan or apply.
              </p>
            </div>
          </UnstableCardContent>
        </UnstableCard>
      )}
    </div>
  );
};
