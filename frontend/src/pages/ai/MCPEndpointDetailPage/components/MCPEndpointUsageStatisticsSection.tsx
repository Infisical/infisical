import { useMemo } from "react";
import { faChartLine, faTools, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useListAiMcpActivityLogs, useListEndpointTools } from "@app/hooks/api";

type Props = {
  endpointId: string;
  endpointName: string;
  projectId: string;
};

type StatCardProps = {
  icon: typeof faChartLine;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    label: string;
  };
};

const StatCard = ({ icon, label, value, subtitle, trend }: StatCardProps) => {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-bunker-300">
        <FontAwesomeIcon icon={icon} className="text-sm" />
        <span className="text-xs tracking-wide uppercase">{label}</span>
      </div>
      <div className="flex flex-col">
        <div className="text-2xl font-semibold text-mineshaft-100">{value}</div>
        {subtitle && <div className="text-xs text-bunker-300">{subtitle}</div>}
        {trend && (
          <div className={`text-xs ${trend.value >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {trend.value >= 0 ? "+" : ""}
            {trend.value} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
};

export const MCPEndpointUsageStatisticsSection = ({
  endpointId,
  endpointName,
  projectId
}: Props) => {
  const { data: activityLogs = [] } = useListAiMcpActivityLogs({
    projectId
  });
  const { data: endpointTools = [] } = useListEndpointTools({ endpointId });

  const statistics = useMemo(() => {
    // Filter logs for this specific endpoint
    const endpointLogs = activityLogs.filter((log) => log.endpointName === endpointName);

    // Total requests
    const totalRequests = endpointLogs.length;

    // Get unique tools used (from activity logs)
    const uniqueTools = new Set(endpointLogs.map((log) => log.toolName));
    const activeToolsCount = uniqueTools.size;

    // Total enabled tools for the endpoint
    const totalEnabledTools = endpointTools.length;

    // Get unique actors (users)
    const uniqueActors = new Set(endpointLogs.map((log) => log.actor));
    const uniqueUsersCount = uniqueActors.size;

    // Calculate weekly trends (last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const lastWeekLogs = endpointLogs.filter((log) => new Date(log.createdAt) >= sevenDaysAgo);
    const previousWeekLogs = endpointLogs.filter(
      (log) => new Date(log.createdAt) >= fourteenDaysAgo && new Date(log.createdAt) < sevenDaysAgo
    );

    // Calculate request trend
    const lastWeekRequests = lastWeekLogs.length;
    const previousWeekRequests = previousWeekLogs.length;

    let requestTrend: number | null = null;
    let requestTrendLabel = "";

    if (previousWeekRequests > 0) {
      // Show percentage change when there's a baseline
      requestTrend = Math.round(
        ((lastWeekRequests - previousWeekRequests) / previousWeekRequests) * 100
      );
      requestTrendLabel = "% from last week";
    } else if (lastWeekRequests > 0) {
      // Show absolute count when starting from zero
      requestTrend = lastWeekRequests;
      requestTrendLabel = "this week";
    }

    // Calculate new users this week
    const lastWeekActors = new Set(lastWeekLogs.map((log) => log.actor));
    const previousActors = new Set(
      endpointLogs.filter((log) => new Date(log.createdAt) < sevenDaysAgo).map((log) => log.actor)
    );
    const newUsersThisWeek = Array.from(lastWeekActors).filter(
      (actor) => !previousActors.has(actor)
    ).length;

    // Calculate active tools
    const lastWeekTools = new Set(lastWeekLogs.map((log) => log.toolName));
    const previousWeekTools = new Set(previousWeekLogs.map((log) => log.toolName));
    const activeToolsThisWeek = lastWeekTools.size;
    const activeToolsPreviousWeek = previousWeekTools.size;

    return {
      totalRequests,
      requestTrend,
      requestTrendLabel,
      activeToolsCount,
      activeToolsThisWeek,
      activeToolsPreviousWeek,
      uniqueUsersCount,
      newUsersThisWeek,
      totalEnabledTools
    };
  }, [activityLogs, endpointName, endpointTools]);

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Usage Statistics</h3>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={faChartLine}
          label="Total Requests"
          value={statistics.totalRequests.toLocaleString()}
          trend={
            statistics.requestTrend !== null
              ? {
                  value: statistics.requestTrend,
                  label: statistics.requestTrendLabel
                }
              : undefined
          }
        />
        <StatCard
          icon={faTools}
          label="Active Tools"
          value={statistics.activeToolsCount}
          subtitle={`of ${statistics.totalEnabledTools} total`}
        />
        <StatCard
          icon={faUsers}
          label="Unique Users"
          value={statistics.uniqueUsersCount}
          trend={
            statistics.newUsersThisWeek > 0
              ? {
                  value: statistics.newUsersThisWeek,
                  label: "new this week"
                }
              : undefined
          }
        />
      </div>
    </div>
  );
};
