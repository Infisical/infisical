import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BoxIcon,
  DollarSignIcon,
  PlayIcon,
  ShieldAlertIcon,
  SparklesIcon,
  XIcon
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

const STAT_ICONS = [BoxIcon, PlayIcon, AlertTriangleIcon, ActivityIcon, DollarSignIcon];
const STAT_ACCENTS = [
  "text-primary",
  "text-green-400",
  "text-yellow-400",
  "text-blue-400",
  "text-emerald-400"
];

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

export const InfraDashboardPage = () => {
  const { currentProject } = useProject();
  const { data: runs, isLoading: runsLoading } = useInfraRuns(currentProject.id);
  const { data: files, isLoading: filesLoading } = useInfraFiles(currentProject.id);
  const { data: resources, isLoading: resourcesLoading } = useInfraResources(currentProject.id);
  const { data: graph } = useInfraGraph(currentProject.id);
  const [expandedSummary, setExpandedSummary] = useState(false);
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

    return { totalRuns, successRuns, failedRuns, awaitingRuns, totalFiles };
  }, [visibleRuns, files]);

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

  const statCards = [
    {
      label: "Resources",
      value: String(resources?.length ?? 0),
      sub: `across ${stats?.totalFiles ?? 0} files`
    },
    {
      label: "Total Runs",
      value: String(stats?.totalRuns ?? 0),
      sub: `${stats?.successRuns ?? 0} successful, ${stats?.failedRuns ?? 0} failed`
    },
    {
      label: "Failed Runs",
      value: String(stats?.failedRuns ?? 0),
      sub: stats?.failedRuns ? "check run logs" : "all clear"
    },
    {
      label: "Last Run",
      value: visibleRuns && visibleRuns.length > 0 ? formatDate(visibleRuns[0].createdAt) : "—",
      sub:
        visibleRuns && visibleRuns.length > 0
          ? `${visibleRuns[0].type} — ${visibleRuns[0].status}`
          : "no runs yet"
    },
    {
      label: "Est. Monthly Cost",
      value: latestAiInsight?.costs.totalMonthly ?? "—",
      sub:
        latestAiInsight?.costs.deltaMonthly && latestAiInsight.costs.deltaMonthly !== "N/A"
          ? `${latestAiInsight.costs.deltaMonthly} delta`
          : "from latest run"
    }
  ];

  const isLoading = runsLoading || filesLoading || resourcesLoading;

  return (
    <div className="flex h-full flex-col gap-6 overflow-hidden">
      <div className="shrink-0">
        <h1 className="text-2xl font-semibold text-mineshaft-100">{currentProject.name}</h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          Infrastructure dashboard — powered by OpenTofu
        </p>
      </div>

      {/* AI Insights from latest run */}
      {latestAiInsight && (
        <UnstableCard className="shrink-0 border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent">
          <UnstableCardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SparklesIcon className="size-4 text-primary" />
                <UnstableCardTitle className="text-sm font-medium text-mineshaft-100">
                  AI Analysis — Latest Run
                </UnstableCardTitle>
                {latestAiInsight.security.issues.length > 0 && (
                  <Badge variant="danger">
                    <ShieldAlertIcon className="size-3" />
                    {latestAiInsight.security.issues.length} issue
                    {latestAiInsight.security.issues.length > 1 ? "s" : ""}
                  </Badge>
                )}
                {latestAiInsight.costs.totalMonthly !== "N/A" && (
                  <Badge variant="info">
                    <DollarSignIcon className="size-3" />
                    {latestAiInsight.costs.totalMonthly}/mo
                  </Badge>
                )}
              </div>
              {expandedSummary ? (
                <button
                  type="button"
                  className="text-mineshaft-500 hover:text-mineshaft-300"
                  onClick={() => setExpandedSummary(false)}
                >
                  <XIcon className="size-4" />
                </button>
              ) : (
                <Button variant="ghost" size="xs" onClick={() => setExpandedSummary(true)}>
                  Expand
                </Button>
              )}
            </div>
          </UnstableCardHeader>
          {expandedSummary && (
            <UnstableCardContent className="pt-0">
              <div className="prose prose-invert prose-sm mb-3 max-w-none text-sm text-mineshaft-300">
                <ReactMarkdown>{latestAiInsight.summary}</ReactMarkdown>
              </div>

              {/* Security findings */}
              {latestAiInsight.security.issues.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                    Security Findings
                  </p>
                  <div className="space-y-1.5">
                    {latestAiInsight.security.issues.map((issue, idx) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Badge
                          variant={
                            issue.severity === "critical" || issue.severity === "high"
                              ? "danger"
                              : "warning"
                          }
                        >
                          {issue.severity}
                        </Badge>
                        <span className="text-mineshaft-300">
                          <span className="font-mono text-mineshaft-400">{issue.resource}</span> —{" "}
                          {issue.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost summary */}
              {(latestAiInsight.costs.estimated.length > 0 ||
                latestAiInsight.costs.aiEstimated.length > 0) && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold tracking-wider text-mineshaft-400 uppercase">
                    Cost Estimate — {latestAiInsight.costs.totalMonthly}/mo (
                    {latestAiInsight.costs.deltaMonthly} delta)
                  </p>
                  <div className="space-y-0.5">
                    {[...latestAiInsight.costs.estimated, ...latestAiInsight.costs.aiEstimated].map(
                      (c, idx) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div key={idx} className="flex justify-between text-xs text-mineshaft-400">
                          <span>{c.resource}</span>
                          <span>{c.monthlyCost}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </UnstableCardContent>
          )}
        </UnstableCard>
      )}

      {/* Stats grid */}
      <div className="grid shrink-0 grid-cols-5 gap-4">
        {statCards.map((stat, idx) => (
          <UnstableCard key={stat.label} className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent>
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-mineshaft-400">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-mineshaft-50">{stat.value}</p>
                  <p className="mt-0.5 text-xs text-mineshaft-500">{stat.sub}</p>
                </div>
                <div className={`rounded-lg bg-mineshaft-700/50 p-2.5 ${STAT_ACCENTS[idx]}`}>
                  {(() => {
                    const Icon = STAT_ICONS[idx];
                    return <Icon className="size-5" />;
                  })()}
                </div>
              </UnstableCardContent>
            )}
          </UnstableCard>
        ))}
      </div>

      {/* Charts */}
      <div className="grid shrink-0 grid-cols-5 gap-4">
        <UnstableCard className="col-span-3">
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Run Activity (7 days)
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="pr-4">
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

        <UnstableCard className="col-span-2 h-full">
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Resource Types
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="my-auto flex items-center justify-center">
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
      </div>

      {/* Topology Graph — fills remaining height */}
      {graph && graph.nodes.length > 0 && !graphFullscreen && (
        <UnstableCard className="flex min-h-0 flex-1 flex-col">
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
    </div>
  );
};
