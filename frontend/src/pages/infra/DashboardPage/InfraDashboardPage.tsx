import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BoxIcon,
  CheckCircle2Icon,
  DollarSignIcon,
  ExpandIcon,
  PlayIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparklesIcon,
  XCircleIcon
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";
import { twMerge } from "tailwind-merge";

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useInfraFiles,
  useInfraGraph,
  useInfraResources,
  useInfraRuns
} from "@app/hooks/api/infra";
import { TAiInsight, TInfraResource } from "@app/hooks/api/infra/types";

import { ResourceDetailPanel } from "../components/ResourceDetailPanel";
import { ResourceTopologyGraph } from "../components/ResourceTopologyGraph";

const RESOURCE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#6b7280"
];

/** Parse a cost string like "$42.50" or "+$10" into a number, or NaN */
const parseCost = (s: string) => parseFloat(s.replace(/[^0-9.\-+]/g, ""));

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

/** Animates a number from 0 to `end` over `duration` ms using easeOut */
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
      const eased = 1 - (1 - progress) ** 3; // easeOutCubic
      setValue(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [end, duration]);

  return value;
};

const AnimatedNumber = ({ value, className }: { value: number; className?: string }) => {
  const display = useCountUp(value);
  return <span className={className}>{display}</span>;
};

/** Stat card wrapper that grows in with a staggered delay */
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

/** Bar that animates from 0% to target width on mount */
const AnimatedBar = ({ percent, className }: { percent: number; className?: string }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    // Delay so browser paints at 0 first, then transition kicks in
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

export const InfraDashboardPage = () => {
  const { currentProject } = useProject();
  const { data: runs, isLoading: runsLoading } = useInfraRuns(currentProject.id);
  const { data: files, isLoading: filesLoading } = useInfraFiles(currentProject.id);
  const { data: resources, isLoading: resourcesLoading } = useInfraResources(currentProject.id);
  const { data: graph } = useInfraGraph(currentProject.id);
  const [insightModalOpen, setInsightModalOpen] = useState(false);
  const [graphFullscreen, setGraphFullscreen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [autoCycling, setAutoCycling] = useState(true);
  const cycleKeyRef = useRef(0); // bumped each cycle to restart the timer animation
  const handleToggleGraphFullscreen = useCallback(() => setGraphFullscreen((p) => !p), []);
  const handleNodeClick = useCallback((nodeId: string) => {
    setAutoCycling(false);
    setSelectedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);
  const handleCloseDetail = useCallback(() => {
    setAutoCycling(true);
    setSelectedNodeId(null);
  }, []);

  // Filter out denied runs — they are cancelled and should not appear
  const visibleRuns = useMemo(() => {
    if (!runs) return null;
    return runs.filter((r) => r.status !== "denied");
  }, [runs]);

  // Parse the latest AI insight from JSON
  const latestAiInsight = useMemo<TAiInsight | null>(() => {
    if (!visibleRuns) return null;
    const runWithAi = visibleRuns.find((r) => r.aiSummary);
    if (!runWithAi?.aiSummary) return null;
    try {
      return JSON.parse(runWithAi.aiSummary) as TAiInsight;
    } catch {
      return {
        summary: runWithAi.aiSummary,
        costs: { estimated: [], aiEstimated: [], totalMonthly: "N/A", deltaMonthly: "N/A" },
        security: { issues: [], shouldApprove: false }
      };
    }
  }, [visibleRuns]);

  // Compute stats from real data
  const stats = useMemo(() => {
    if (!visibleRuns) return null;
    const totalRuns = visibleRuns.length;
    const successRuns = visibleRuns.filter((r) => r.status === "success").length;
    const failedRuns = visibleRuns.filter((r) => r.status === "failed").length;
    const awaitingRuns = visibleRuns.filter((r) => r.status === "awaiting_approval").length;
    const totalFiles = files?.length ?? 0;
    const successRate = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;

    return { totalRuns, successRuns, failedRuns, awaitingRuns, totalFiles, successRate };
  }, [visibleRuns, files]);

  // Provider counts from resources
  const providerCounts = useMemo(() => {
    if (!resources || resources.length === 0) return [];
    const counts: Record<string, number> = {};
    resources.forEach((r) => {
      counts[r.provider] = (counts[r.provider] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [resources]);

  // Cost delta info
  const costDelta = useMemo(() => {
    if (!latestAiInsight) return null;
    const delta = latestAiInsight.costs.deltaMonthly;
    if (!delta || delta === "N/A") return null;
    const num = parseCost(delta);
    if (Number.isNaN(num)) return null;
    return { value: delta, direction: num > 0 ? "up" : num < 0 ? "down" : "flat" } as const;
  }, [latestAiInsight]);

  // Security summary
  const securitySummary = useMemo(() => {
    if (!latestAiInsight) return null;
    const { issues } = latestAiInsight.security;
    const critical = issues.filter(
      (i) => i.severity === "critical" || i.severity === "high"
    ).length;
    const medium = issues.filter((i) => i.severity === "medium").length;
    const low = issues.filter((i) => i.severity === "low").length;
    return { total: issues.length, critical, medium, low };
  }, [latestAiInsight]);

  // Build activity chart from runs (group by day)
  const activityData = useMemo(() => {
    if (!visibleRuns || visibleRuns.length === 0) return [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const buckets: Record<string, { success: number; failed: number }> = {};

    // Last 7 days
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = days[d.getDay()];
      buckets[`${label}-${i}`] = { success: 0, failed: 0 };
    }

    const keys = Object.keys(buckets);
    visibleRuns.forEach((r) => {
      const d = new Date(r.createdAt);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diffDays < 7) {
        const key = keys[6 - diffDays];
        if (key) {
          if (r.status === "success") buckets[key].success += 1;
          else if (r.status === "failed") buckets[key].failed += 1;
        }
      }
    });

    return keys.map((key) => ({
      day: key.split("-")[0],
      success: buckets[key].success,
      failed: buckets[key].failed,
      runs: buckets[key].success + buckets[key].failed
    }));
  }, [visibleRuns]);

  // Resource type breakdown for pie chart
  const resourceBreakdown = useMemo(() => {
    if (!resources || resources.length === 0) return [];
    const counts: Record<string, number> = {};
    resources.forEach((r) => {
      counts[r.type] = (counts[r.type] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value], i) => ({
      name,
      value,
      color: RESOURCE_COLORS[i % RESOURCE_COLORS.length]
    }));
  }, [resources]);

  // Resource lookup by address for detail panel
  const resourceMap = useMemo(() => {
    if (!resources) return new Map<string, TInfraResource>();
    const map = new Map<string, TInfraResource>();
    for (const r of resources) map.set(r.address, r);
    return map;
  }, [resources]);

  const selectedResource = selectedNodeId ? (resourceMap.get(selectedNodeId) ?? null) : null;

  // Build cost map from latest AI insight
  const costMap = useMemo<Record<string, string>>(() => {
    if (!latestAiInsight) return {};
    try {
      const map: Record<string, string> = {};
      for (const c of [...latestAiInsight.costs.estimated, ...latestAiInsight.costs.aiEstimated]) {
        if (c.monthlyCost && c.monthlyCost !== "$0.00") {
          map[c.resource] = c.monthlyCost;
        }
      }
      return map;
    } catch {
      return {};
    }
  }, [latestAiInsight]);

  // Auto-cycle through nodes every 4s for a "live dashboard" feel.
  // Pauses when the user manually selects a node; resumes on close.
  const CYCLE_DURATION = 4000;
  useEffect(() => {
    const nodes = graph?.nodes;
    if (!nodes || nodes.length === 0 || graphFullscreen || !autoCycling) return;

    let idx = 0;
    cycleKeyRef.current += 1;
    setSelectedNodeId(nodes[0].id);

    const interval = setInterval(() => {
      idx = (idx + 1) % nodes.length;
      cycleKeyRef.current += 1;
      setSelectedNodeId(nodes[idx].id);
    }, CYCLE_DURATION);

    return () => clearInterval(interval);
  }, [graph?.nodes, graphFullscreen, autoCycling]);

  const isLoading = runsLoading || filesLoading || resourcesLoading;

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-mineshaft-100">{currentProject.name}</h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          Infrastructure dashboard — powered by OpenTofu
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid shrink-0 grid-cols-5 gap-4">
        {/* Resources */}
        <GrowIn delay={0}>
          <UnstableCard className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-mineshaft-400">Resources</p>
                  <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                    <AnimatedNumber value={resources?.length ?? 0} />
                  </p>
                  {providerCounts.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {providerCounts.map(([provider, count]) => (
                        <span key={provider} className="text-xs text-mineshaft-500">
                          {count} {provider}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-mineshaft-500">
                      across {stats?.totalFiles ?? 0} files
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-primary">
                  <BoxIcon className="size-5" />
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        </GrowIn>

        {/* Runs */}
        <GrowIn delay={60}>
          <UnstableCard className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-mineshaft-400">Runs</p>
                      <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                        <AnimatedNumber value={stats?.totalRuns ?? 0} />
                      </p>
                    </div>
                    <div className="h-fit rounded-lg bg-mineshaft-700/50 p-2.5 text-green-400">
                      <PlayIcon className="size-5" />
                    </div>
                  </div>
                  {stats && stats.totalRuns > 0 ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-red-500">
                        <AnimatedBar
                          percent={stats.successRate}
                          className="h-full rounded-full rounded-r-none bg-green-500"
                        />
                      </div>
                      <span className="text-xs text-green-400">
                        <AnimatedNumber value={stats.successRate} />%
                      </span>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-mineshaft-500">no runs yet</p>
                  )}
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        </GrowIn>

        {/* Last Run */}
        <GrowIn delay={120}>
          <UnstableCard className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-mineshaft-400">Last Run</p>
                  {visibleRuns && visibleRuns.length > 0 ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                        {formatDate(visibleRuns[0].createdAt)}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <Badge
                          variant={
                            visibleRuns[0].status === "success"
                              ? "success"
                              : visibleRuns[0].status === "failed"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {visibleRuns[0].type}
                        </Badge>
                        {visibleRuns[0].status === "success" ? (
                          <CheckCircle2Icon className="size-3 text-green-500" />
                        ) : visibleRuns[0].status === "failed" ? (
                          <XCircleIcon className="size-3 text-red-500" />
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-2xl font-bold text-mineshaft-50">—</p>
                  )}
                </div>
                <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-blue-400">
                  <ActivityIcon className="size-5" />
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        </GrowIn>

        {/* Est. Monthly Cost */}
        <GrowIn delay={180}>
          <UnstableCard className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-mineshaft-400">Est. Monthly Cost</p>
                  <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                    {latestAiInsight?.costs.totalMonthly ?? "—"}
                  </p>
                  {costDelta ? (
                    <div
                      className={twMerge(
                        "mt-0.5 flex items-center gap-1 text-xs",
                        costDelta.direction === "up" && "text-red-400",
                        costDelta.direction === "down" && "text-green-400",
                        costDelta.direction === "flat" && "text-mineshaft-500"
                      )}
                    >
                      {costDelta.direction === "up" ? (
                        <ArrowUpIcon className="size-3" />
                      ) : costDelta.direction === "down" ? (
                        <ArrowDownIcon className="size-3" />
                      ) : null}
                      <span>{costDelta.value}</span>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-mineshaft-500">from latest plan</p>
                  )}
                </div>
                <div className="rounded-lg bg-mineshaft-700/50 p-2.5 text-emerald-400">
                  <DollarSignIcon className="size-5" />
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        </GrowIn>

        {/* Security */}
        <GrowIn delay={240}>
          <UnstableCard className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-mineshaft-400">Security</p>
                  {securitySummary && securitySummary.total > 0 ? (
                    <>
                      <p className="mt-1 text-2xl font-bold text-mineshaft-50">
                        <AnimatedNumber value={securitySummary.total} /> issue
                        {securitySummary.total > 1 ? "s" : ""}
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {securitySummary.critical > 0 && (
                          <span className="text-xs text-red-400">
                            {securitySummary.critical} critical
                          </span>
                        )}
                        {securitySummary.medium > 0 && (
                          <span className="text-xs text-yellow-400">
                            {securitySummary.medium} med
                          </span>
                        )}
                        {securitySummary.low > 0 && (
                          <span className="text-xs text-mineshaft-500">
                            {securitySummary.low} low
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 text-2xl font-bold text-green-400">Clear</p>
                      <p className="mt-0.5 text-xs text-mineshaft-500">no issues found</p>
                    </>
                  )}
                </div>
                <div
                  className={twMerge(
                    "rounded-lg bg-mineshaft-700/50 p-2.5",
                    securitySummary && securitySummary.critical > 0
                      ? "text-red-400"
                      : "text-green-400"
                  )}
                >
                  {securitySummary && securitySummary.total > 0 ? (
                    <ShieldAlertIcon className="size-5" />
                  ) : (
                    <ShieldCheckIcon className="size-5" />
                  )}
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        </GrowIn>
      </div>

      {/* Charts */}
      <div className="grid shrink-0 grid-cols-5 gap-4">
        {/* AI Insights sidebar */}
        {latestAiInsight && (
          <GrowIn delay={60} className="col-span-1 flex h-full shrink-0 flex-col gap-3">
            <UnstableCard className="flex h-full flex-col border-primary/20 bg-gradient-to-b from-primary/[0.04] to-transparent">
              <UnstableCardHeader>
                <div className="flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" />
                  <UnstableCardTitle className="text-xs font-medium text-mineshaft-100">
                    AI Analysis — Latest Run
                  </UnstableCardTitle>
                </div>
              </UnstableCardHeader>
              <UnstableCardContent className="flex flex-1 flex-col gap-3">
                <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed text-mineshaft-300 [&_li]:my-0 [&_p]:my-1 [&_ul]:my-1">
                  <ReactMarkdown>{latestAiInsight.summary}</ReactMarkdown>
                </div>

                {/* Quick badges */}
                <div className="flex flex-wrap gap-1.5">
                  {latestAiInsight.costs.totalMonthly !== "N/A" && (
                    <Badge variant="info">
                      <DollarSignIcon className="size-3" />
                      {latestAiInsight.costs.totalMonthly}/mo
                    </Badge>
                  )}
                  {latestAiInsight.security.issues.length > 0 && (
                    <Badge variant="danger">
                      <ShieldAlertIcon className="size-3" />
                      {latestAiInsight.security.issues.length} issue
                      {latestAiInsight.security.issues.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                <div className="mt-auto pt-1">
                  <Button
                    variant="neutral"
                    size="xs"
                    className="w-full"
                    onClick={() => setInsightModalOpen(true)}
                  >
                    <ExpandIcon className="size-3" />
                    View Details
                  </Button>
                </div>
              </UnstableCardContent>
            </UnstableCard>
          </GrowIn>
        )}
        <GrowIn delay={120} className="col-span-3">
          <UnstableCard className="h-full">
            <UnstableCardHeader>
              <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                Run Activity (Weekly)
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent className="my-auto pr-4">
              {activityData.length === 0 ? (
                <div className="flex h-[220px] items-center justify-center text-sm text-mineshaft-500">
                  No run data yet
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={activityData}>
                    <defs>
                      <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="failedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis dataKey="day" stroke="#666" fontSize={12} />
                    <YAxis stroke="#666" fontSize={12} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#1e1e1e",
                        border: "1px solid #333",
                        borderRadius: "8px",
                        fontSize: "12px"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="success"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#successGradient)"
                      name="Successful"
                    />
                    <Area
                      type="monotone"
                      dataKey="failed"
                      stroke="#ef4444"
                      strokeWidth={2}
                      fill="url(#failedGradient)"
                      name="Failed"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>
        <GrowIn delay={180}>
          <UnstableCard
            className={twMerge("h-full", latestAiInsight ? "col-span-1" : "col-span-2")}
          >
            <UnstableCardHeader>
              <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                Resource Types
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent className="my-auto flex items-center overflow-auto">
              {resourceBreakdown.length === 0 ? (
                <div className="flex h-[160px] items-center justify-center text-sm text-mineshaft-500">
                  No resources yet
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart>
                      <Pie
                        data={resourceBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={3}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {resourceBreakdown.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: "#1e1e1e",
                          border: "1px solid #333",
                          borderRadius: "8px",
                          fontSize: "12px"
                        }}
                        labelStyle={{ color: "#e5e5e5" }}
                        itemStyle={{ color: "#e5e5e5" }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-col gap-1.5">
                    {resourceBreakdown.slice(0, 7).map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2 text-xs">
                        <span
                          className="inline-block size-2.5 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="font-mono text-mineshaft-400">{entry.name}</span>
                        <span className="font-medium text-mineshaft-200">{entry.value}</span>
                      </div>
                    ))}
                    {resourceBreakdown.length > 7 && (
                      <div className="text-xs text-mineshaft-500">
                        +{resourceBreakdown.length - 7} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>
      </div>

      {/* Topology Graph — fills remaining height */}
      {graph && graph.nodes.length > 0 && !graphFullscreen && (
        <GrowIn delay={120} className="h-full min-h-0">
          <UnstableCard className="flex h-full min-h-0 flex-1 flex-col">
            <UnstableCardHeader className="shrink-0">
              <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
                Resource Topology
              </UnstableCardTitle>
            </UnstableCardHeader>
            <UnstableCardContent className="flex min-h-0 flex-1 gap-0 p-0">
              <div className="min-w-0 flex-1">
                <ResourceTopologyGraph
                  nodes={graph.nodes}
                  edges={graph.edges}
                  className={twMerge("h-full", selectedResource && "rounded-r-none border-r-0")}
                  onNodeClick={handleNodeClick}
                  selectedNodeId={selectedNodeId}
                  onToggleFullscreen={handleToggleGraphFullscreen}
                />
              </div>
              {selectedResource && (
                <ResourceDetailPanel
                  resource={selectedResource}
                  costMap={costMap}
                  onClose={handleCloseDetail}
                  cycleTimer={{
                    durationMs: CYCLE_DURATION,
                    active: autoCycling,
                    nodeKey: String(cycleKeyRef.current)
                  }}
                  files={files}
                />
              )}
            </UnstableCardContent>
          </UnstableCard>
        </GrowIn>
      )}
      {graph && graph.nodes.length > 0 && graphFullscreen && (
        <div className="fixed inset-0 z-50 flex bg-bunker-800">
          <div className="min-w-0 flex-1">
            <ResourceTopologyGraph
              nodes={graph.nodes}
              edges={graph.edges}
              className={twMerge("h-full", selectedResource && "rounded-r-none border-r-0")}
              fullscreen
              onNodeClick={handleNodeClick}
              selectedNodeId={selectedNodeId}
              onToggleFullscreen={handleToggleGraphFullscreen}
            />
          </div>
          {selectedResource && (
            <ResourceDetailPanel
              resource={selectedResource}
              costMap={costMap}
              onClose={handleCloseDetail}
              cycleTimer={{
                durationMs: CYCLE_DURATION,
                active: autoCycling,
                nodeKey: String(cycleKeyRef.current)
              }}
              files={files}
            />
          )}
        </div>
      )}

      {/* AI Insights Detail Modal */}
      {latestAiInsight && (
        <Dialog open={insightModalOpen} onOpenChange={setInsightModalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-mineshaft-100">
                <SparklesIcon className="size-5 text-primary" />
                AI Analysis — Latest Run
              </DialogTitle>
              <DialogDescription className="text-mineshaft-400">
                Automated analysis of your latest infrastructure changes
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-5">
              {/* Summary */}
              <div className="prose prose-invert prose-sm max-w-none text-sm text-mineshaft-300">
                <ReactMarkdown>{latestAiInsight.summary}</ReactMarkdown>
              </div>

              {/* Security findings */}
              {latestAiInsight.security.issues.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                    Security Findings
                  </p>
                  <div className="space-y-2">
                    {latestAiInsight.security.issues.map((issue, idx) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className="rounded-md border border-mineshaft-600 bg-mineshaft-700/30 p-3"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge
                            variant={
                              issue.severity === "critical" || issue.severity === "high"
                                ? "danger"
                                : "warning"
                            }
                          >
                            {issue.severity}
                          </Badge>
                          <span className="font-mono text-xs text-mineshaft-400">
                            {issue.resource}
                          </span>
                        </div>
                        <p className="text-xs text-mineshaft-300">{issue.description}</p>
                        {issue.recommendation && (
                          <p className="mt-1 text-xs text-mineshaft-500">{issue.recommendation}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost estimates */}
              {(latestAiInsight.costs.estimated.length > 0 ||
                latestAiInsight.costs.aiEstimated.length > 0) && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                    Cost Estimate — {latestAiInsight.costs.totalMonthly}/mo
                    {latestAiInsight.costs.deltaMonthly !== "N/A" &&
                      ` (${latestAiInsight.costs.deltaMonthly} delta)`}
                  </p>
                  <div className="rounded-md border border-mineshaft-600">
                    {[
                      ...latestAiInsight.costs.estimated.map((c) => ({
                        ...c,
                        kind: "static" as const
                      })),
                      ...latestAiInsight.costs.aiEstimated.map((c) => ({
                        ...c,
                        kind: "ai" as const
                      }))
                    ].map((c, idx) => (
                      <div
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className={twMerge(
                          "flex items-center justify-between px-3 py-2 text-xs",
                          idx > 0 && "border-t border-mineshaft-600"
                        )}
                      >
                        <span className="font-mono text-mineshaft-300">{c.resource}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-mineshaft-200">{c.monthlyCost}</span>
                          {c.kind === "ai" && (
                            <Badge variant="warning">
                              <SparklesIcon className="size-2.5" />
                              AI est.
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
