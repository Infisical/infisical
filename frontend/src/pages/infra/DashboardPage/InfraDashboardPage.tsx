import { useMemo, useState } from "react";
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
import ReactMarkdown from "react-markdown";
import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  AlertTriangleIcon,
  BoxIcon,
  ChevronRightIcon,
  DollarSignIcon,
  PlayIcon,
  ShieldAlertIcon,
  SparklesIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  Skeleton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { useInfraFiles, useInfraResources, useInfraRuns } from "@app/hooks/api/infra";
import { TAiInsight, TInfraRun } from "@app/hooks/api/infra/types";

const RESOURCE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#6b7280"
];

const STAT_ICONS = [BoxIcon, PlayIcon, AlertTriangleIcon, ActivityIcon];
const STAT_ACCENTS = ["text-primary", "text-green-400", "text-yellow-400", "text-blue-400"];

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
};

export const InfraDashboardPage = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data: runs, isLoading: runsLoading } = useInfraRuns(currentProject.id);
  const { data: files, isLoading: filesLoading } = useInfraFiles(currentProject.id);
  const { data: resources, isLoading: resourcesLoading } = useInfraResources(currentProject.id);
  const [expandedSummary, setExpandedSummary] = useState(false);

  // Parse the latest AI insight from JSON
  const latestAiInsight = useMemo<TAiInsight | null>(() => {
    if (!runs) return null;
    const runWithAi = runs.find((r) => r.aiSummary);
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
  }, [runs]);

  // Compute stats from real data
  const stats = useMemo(() => {
    if (!runs) return null;
    const totalRuns = runs.length;
    const successRuns = runs.filter((r) => r.status === "success").length;
    const failedRuns = runs.filter((r) => r.status === "failed").length;
    const awaitingRuns = runs.filter((r) => r.status === "awaiting_approval").length;
    const totalFiles = files?.length ?? 0;

    return { totalRuns, successRuns, failedRuns, awaitingRuns, totalFiles };
  }, [runs, files]);

  // Build activity chart from runs (group by day)
  const activityData = useMemo(() => {
    if (!runs || runs.length === 0) return [];
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
    runs.forEach((r) => {
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
  }, [runs]);

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
      value: runs && runs.length > 0 ? formatDate(runs[0].createdAt) : "—",
      sub: runs && runs.length > 0 ? `${runs[0].type} — ${runs[0].status}` : "no runs yet"
    }
  ];

  const isLoading = runsLoading || filesLoading || resourcesLoading;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-mineshaft-100">{currentProject.name}</h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          Infrastructure dashboard — powered by OpenTofu
        </p>
      </div>

      {/* AI Insights from latest run */}
      {latestAiInsight && (
        <UnstableCard className="border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent">
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
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((stat, idx) => (
          <UnstableCard key={stat.label} className="relative overflow-hidden">
            {isLoading ? (
              <UnstableCardContent className="p-5">
                <Skeleton className="h-16 w-full" />
              </UnstableCardContent>
            ) : (
              <UnstableCardContent className="flex items-start justify-between p-5">
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
      <div className="grid grid-cols-5 gap-4">
        <UnstableCard className="col-span-3">
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Run Activity (7 days)
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="pr-4 pb-4">
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
          <UnstableCardContent className="my-auto flex items-center justify-center pb-4">
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
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5">
                  {resourceBreakdown.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="font-mono text-mineshaft-400">{entry.name}</span>
                      <span className="font-medium text-mineshaft-200">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </UnstableCardContent>
        </UnstableCard>
      </div>

      {/* Recent Runs */}
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
            Recent Runs
          </UnstableCardTitle>
        </UnstableCardHeader>
        <UnstableCardContent className="p-0">
          {!runs || runs.length === 0 ? (
            <div className="p-6 text-center text-sm text-mineshaft-500">
              No runs yet. Go to the Editor to run your first plan.
            </div>
          ) : (
            <div className="divide-y divide-mineshaft-600">
              {runs.slice(0, 5).map((run: TInfraRun) => (
                <Link
                  key={run.id}
                  to="/organizations/$orgId/projects/infra/$projectId/run/$runId"
                  params={{
                    orgId: currentOrg.id,
                    projectId: currentProject.id,
                    runId: run.id
                  }}
                  className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-mineshaft-700/30"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-block size-2 rounded-full ${
                        run.status === "success"
                          ? "bg-green-500"
                          : run.status === "failed"
                            ? "bg-red-500"
                            : run.status === "awaiting_approval"
                              ? "bg-yellow-500"
                              : "bg-blue-500"
                      }`}
                    />
                    <span className="font-mono text-xs text-mineshaft-300">
                      {run.id.slice(0, 8)}
                    </span>
                    <Badge variant={run.type === "apply" ? "success" : "info"}>{run.type}</Badge>
                    {run.aiSummary && (
                      <Badge variant="default">
                        <SparklesIcon className="size-3" />
                        AI
                      </Badge>
                    )}
                    {run.status === "awaiting_approval" && (
                      <Badge variant="warning">
                        <AlertTriangleIcon className="size-3" />
                        Needs Approval
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-mineshaft-400">
                    <Badge
                      variant={
                        run.status === "success"
                          ? "success"
                          : run.status === "failed"
                            ? "danger"
                            : run.status === "awaiting_approval"
                              ? "warning"
                              : "info"
                      }
                    >
                      {run.status === "awaiting_approval" ? "awaiting approval" : run.status}
                    </Badge>
                    <span>{formatDate(run.createdAt)}</span>
                    <ChevronRightIcon className="size-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
