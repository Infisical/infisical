import { useState } from "react";
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
import {
  ActivityIcon,
  AlertTriangleIcon,
  BoxIcon,
  DollarSignIcon,
  PlayIcon,
  SparklesIcon,
  TrendingUpIcon,
  XIcon
} from "lucide-react";

import {
  Badge,
  Button,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";

const ACTIVITY_DATA = [
  { day: "Mon", runs: 3, success: 3, failed: 0 },
  { day: "Tue", runs: 5, success: 4, failed: 1 },
  { day: "Wed", runs: 2, success: 2, failed: 0 },
  { day: "Thu", runs: 8, success: 7, failed: 1 },
  { day: "Fri", runs: 4, success: 3, failed: 1 },
  { day: "Sat", runs: 12, success: 10, failed: 2 },
  { day: "Sun", runs: 7, success: 7, failed: 0 }
];

const RESOURCE_BREAKDOWN = [
  { name: "EC2 Instances", value: 4, color: "#f97316" },
  { name: "S3 Buckets", value: 3, color: "#3b82f6" },
  { name: "Security Groups", value: 3, color: "#a855f7" },
  { name: "VPCs", value: 2, color: "#22c55e" },
  { name: "RDS Instances", value: 2, color: "#eab308" },
  { name: "IAM Roles", value: 2, color: "#ec4899" },
  { name: "Other", value: 2, color: "#6b7280" }
];

const MOCK_RECENT_RUNS = [
  { id: "run-0041", type: "apply" as const, status: "success" as const, resources: 3, duration: "12s", time: "2 min ago" },
  { id: "run-0040", type: "plan" as const, status: "success" as const, resources: 5, duration: "4s", time: "15 min ago" },
  { id: "run-0039", type: "apply" as const, status: "failed" as const, resources: 1, duration: "8s", time: "1 hour ago" },
  { id: "run-0038", type: "apply" as const, status: "success" as const, resources: 7, duration: "23s", time: "3 hours ago" },
  { id: "run-0037", type: "plan" as const, status: "success" as const, resources: 2, duration: "3s", time: "1 day ago" }
];

const AI_INSIGHTS = [
  {
    type: "optimization" as const,
    title: "Right-size EC2 instances",
    description: "2 instances (web-server-1, worker) have been running below 15% CPU utilization for the last 7 days. Consider downsizing from t3.medium to t3.small to save ~$18/mo."
  },
  {
    type: "security" as const,
    title: "Tighten security group rules",
    description: "Security group 'web-sg' has port 22 open to 0.0.0.0/0. Restrict SSH access to your IP range or use SSM Session Manager instead."
  },
  {
    type: "drift" as const,
    title: "Configuration drift detected",
    description: "Resource 'aws_s3_bucket.backups' has drifted from its declared state. The bucket policy was modified outside of OpenTofu. Run a plan to review changes."
  }
];

const STAT_CARDS = [
  { label: "Total Resources", value: "18", sub: "across 3 providers", icon: BoxIcon, accent: "text-primary" },
  { label: "Runs (24h)", value: "12", sub: "10 successful, 2 failed", icon: PlayIcon, accent: "text-green-400" },
  { label: "Drift Detected", value: "2", sub: "last checked 5 min ago", icon: AlertTriangleIcon, accent: "text-yellow-400" },
  { label: "Cost Estimate", value: "$47/mo", sub: "+$3 from last run", icon: DollarSignIcon, accent: "text-blue-400" }
];

const insightIcon = (type: string) => {
  switch (type) {
    case "optimization":
      return <TrendingUpIcon className="size-4 text-blue-400" />;
    case "security":
      return <AlertTriangleIcon className="size-4 text-yellow-400" />;
    case "drift":
      return <ActivityIcon className="size-4 text-orange-400" />;
    default:
      return <SparklesIcon className="size-4 text-primary" />;
  }
};

const insightBadgeVariant = (type: string): "info" | "warning" | "danger" => {
  switch (type) {
    case "optimization":
      return "info";
    case "security":
      return "warning";
    case "drift":
      return "danger";
    default:
      return "info";
  }
};

export const InfraDashboardPage = () => {
  const { currentProject } = useProject();
  const [dismissedInsights, setDismissedInsights] = useState<Set<number>>(new Set());

  const visibleInsights = AI_INSIGHTS.filter((_, i) => !dismissedInsights.has(i));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-mineshaft-100">
          {currentProject.name}
        </h1>
        <p className="mt-1 text-sm text-mineshaft-400">
          Infrastructure dashboard — powered by OpenTofu
        </p>
      </div>

      {/* AI Insights Panel */}
      {visibleInsights.length > 0 && (
        <UnstableCard className="border-primary/20 bg-gradient-to-r from-primary/[0.04] to-transparent">
          <UnstableCardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary/10">
                <SparklesIcon className="size-4 text-primary" />
              </div>
              <UnstableCardTitle className="text-sm font-medium text-mineshaft-100">
                AI Infrastructure Insights
              </UnstableCardTitle>
              <Badge variant="info" className="ml-1">
                {visibleInsights.length} suggestions
              </Badge>
            </div>
          </UnstableCardHeader>
          <UnstableCardContent className="flex flex-col gap-3 pt-0">
            {AI_INSIGHTS.map((insight, i) =>
              dismissedInsights.has(i) ? null : (
                <div
                  key={insight.title}
                  className="group flex items-start gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-800/60 p-3 transition-colors hover:border-mineshaft-500"
                >
                  <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-mineshaft-700">
                    {insightIcon(insight.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-mineshaft-100">{insight.title}</span>
                      <Badge variant={insightBadgeVariant(insight.type)} className="capitalize">
                        {insight.type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-mineshaft-400">
                      {insight.description}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-mineshaft-500 opacity-0 transition-opacity hover:text-mineshaft-300 group-hover:opacity-100"
                    onClick={() => setDismissedInsights((prev) => new Set(prev).add(i))}
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              )
            )}
          </UnstableCardContent>
        </UnstableCard>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-4">
        {STAT_CARDS.map((stat) => (
          <UnstableCard key={stat.label} className="relative overflow-hidden">
            <UnstableCardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-medium text-mineshaft-400">{stat.label}</p>
                <p className="mt-1 text-2xl font-bold text-mineshaft-50">{stat.value}</p>
                {stat.sub && <p className="mt-0.5 text-xs text-mineshaft-500">{stat.sub}</p>}
              </div>
              <div className={`rounded-lg bg-mineshaft-700/50 p-2.5 ${stat.accent}`}>
                <stat.icon className="size-5" />
              </div>
            </UnstableCardContent>
          </UnstableCard>
        ))}
      </div>

      {/* Two-column: Activity Chart + Resource Pie */}
      <div className="grid grid-cols-5 gap-4">
        <UnstableCard className="col-span-3">
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Run Activity (7 days)
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="pb-4 pr-4">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={ACTIVITY_DATA}>
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
                <YAxis stroke="#666" fontSize={12} />
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
          </UnstableCardContent>
        </UnstableCard>

        <UnstableCard className="col-span-2">
          <UnstableCardHeader>
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Resources by Type
            </UnstableCardTitle>
          </UnstableCardHeader>
          <UnstableCardContent className="flex items-center justify-center pb-4">
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={RESOURCE_BREAKDOWN}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {RESOURCE_BREAKDOWN.map((entry) => (
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
                {RESOURCE_BREAKDOWN.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block size-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-mineshaft-400">{entry.name}</span>
                    <span className="font-medium text-mineshaft-200">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </UnstableCardContent>
        </UnstableCard>
      </div>

      {/* Recent Runs Table */}
      <UnstableCard>
        <UnstableCardHeader>
          <div className="flex items-center justify-between">
            <UnstableCardTitle className="text-sm font-medium text-mineshaft-200">
              Recent Runs
            </UnstableCardTitle>
            <Button variant="ghost" size="xs">
              View all
            </Button>
          </div>
        </UnstableCardHeader>
        <UnstableCardContent className="p-0">
          <div className="divide-y divide-mineshaft-600">
            {MOCK_RECENT_RUNS.map((run) => (
              <div
                key={run.id}
                className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-mineshaft-700/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      run.status === "success" ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span className="font-mono text-xs text-mineshaft-300">{run.id}</span>
                  <Badge variant={run.type === "apply" ? "success" : "info"}>
                    {run.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-6 text-xs text-mineshaft-400">
                  <span>{run.resources} resources</span>
                  <span>{run.duration}</span>
                  <span className="w-20 text-right">{run.time}</span>
                </div>
              </div>
            ))}
          </div>
        </UnstableCardContent>
      </UnstableCard>
    </div>
  );
};
