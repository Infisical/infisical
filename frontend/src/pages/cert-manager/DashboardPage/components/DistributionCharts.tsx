import { Link } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { twMerge } from "tailwind-merge";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import type { TDashboardDistribution, TDashboardStats } from "@app/hooks/api/certificates";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";

import {
  CHART_COLORS_HEX,
  CHART_OTHER_COLOR,
  formatShare,
  MAX_DONUT_SEGMENTS
} from "./chart-theme";
import type { InventoryFilters, InventoryLink } from "./inventory-link";

type Props = {
  stats: TDashboardStats;
  getLink: (filters: InventoryFilters) => InventoryLink;
  onNavigate: (filters: InventoryFilters) => void;
};

type ChartKey = "enrollmentMethod" | "algorithm" | "ca";

type Segment = TDashboardDistribution & { groupedCount?: number };

const foldTail = (data: TDashboardDistribution[]): Segment[] => {
  const sorted = data.filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
  if (sorted.length <= MAX_DONUT_SEGMENTS) return sorted;

  const head = sorted.slice(0, MAX_DONUT_SEGMENTS - 1);
  const tail = sorted.slice(MAX_DONUT_SEGMENTS - 1);
  return [
    ...head,
    {
      label: "Other",
      count: tail.reduce((sum, d) => sum + d.count, 0),
      groupedCount: tail.length
    }
  ];
};

const OTHER_KEY = "__other__";

const segmentKey = (segment: Segment) => (segment.groupedCount ? OTHER_KEY : segment.label);

const colorAt = (segment: Segment, idx: number) =>
  segment.groupedCount ? CHART_OTHER_COLOR : CHART_COLORS_HEX[idx % CHART_COLORS_HEX.length];

const DonutChart = ({
  title,
  subtitle,
  data,
  chartKey,
  getSegmentFilters,
  getLink,
  onNavigate
}: {
  title: string;
  subtitle?: string;
  data: TDashboardDistribution[];
  chartKey: ChartKey;
  getSegmentFilters: (entry: TDashboardDistribution) => InventoryFilters | null;
  getLink: (filters: InventoryFilters) => InventoryLink;
  onNavigate: (filters: InventoryFilters) => void;
}) => {
  const nonZeroData = foldTail(data);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const chartId = title.replace(/\s+/g, "-").toLowerCase();
  const formatLabel = (label: string) => {
    if (chartKey === "algorithm") {
      return (
        (certKeyAlgorithmToNameMap as Record<string, string>)[label] ?? label.replace(/_/g, " ")
      );
    }
    if (chartKey === "enrollmentMethod" && label !== "Other") return label.toUpperCase();
    return label;
  };

  return (
    <Card className="flex h-auto min-w-0 flex-col">
      <CardHeader className="pb-0">
        <CardTitle className="text-base font-normal">{title}</CardTitle>
        {subtitle && <CardDescription className="text-xs">{subtitle}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-1 items-center pt-2">
        {nonZeroData.length === 0 ? (
          <Empty className="h-[200px]">
            <EmptyHeader>
              <EmptyTitle>No data available</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex w-full items-center gap-3">
            <div className="w-[120px] shrink-0">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <defs>
                    {nonZeroData.map((entry, idx) => {
                      const hex = colorAt(entry, idx);
                      return (
                        <linearGradient
                          key={`grad-${segmentKey(entry)}`}
                          id={`grad-${chartId}-${idx}`}
                          x1="0"
                          y1="0"
                          x2="1"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={hex} stopOpacity={1} />
                          <stop offset="100%" stopColor={hex} stopOpacity={0.6} />
                        </linearGradient>
                      );
                    })}
                  </defs>
                  <Pie
                    data={nonZeroData}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={32}
                    outerRadius={52}
                    paddingAngle={2}
                    cursor="pointer"
                    stroke="none"
                    onClick={(_entry, idx) => {
                      const segment = nonZeroData[idx];
                      const filters = segment.groupedCount ? null : getSegmentFilters(segment);
                      if (filters) onNavigate(filters);
                    }}
                  >
                    {nonZeroData.map((entry, idx) => (
                      <Cell key={segmentKey(entry)} fill={`url(#grad-${chartId}-${idx})`} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      color: "var(--color-foreground)"
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 flex-1">
              <div className="space-y-1.5">
                {nonZeroData.map((entry, idx) => {
                  const pct = formatShare(entry.count, total);
                  const isOther = Boolean(entry.groupedCount);
                  const filters = isOther ? null : getSegmentFilters(entry);
                  const legendClassName = twMerge(
                    "flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors",
                    filters ? "cursor-pointer hover:bg-foreground/5" : "cursor-default"
                  );
                  const legendContent = (
                    <>
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: colorAt(entry, idx) }}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="min-w-0 flex-1 truncate text-left text-foreground">
                            {formatLabel(entry.label)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {isOther ? `${entry.groupedCount} more` : formatLabel(entry.label)}
                        </TooltipContent>
                      </Tooltip>
                      <span className="shrink-0 text-right text-muted">{pct}</span>
                      <span className="shrink-0 text-right font-medium text-foreground">
                        {entry.count}
                      </span>
                    </>
                  );
                  return filters ? (
                    <Link key={segmentKey(entry)} {...getLink(filters)} className={legendClassName}>
                      {legendContent}
                    </Link>
                  ) : (
                    <div key={segmentKey(entry)} className={legendClassName}>
                      {legendContent}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center border-t border-border px-1 pt-2 text-xs">
                <span className="flex-1 font-medium text-foreground">Total</span>
                <span className="shrink-0 text-right font-semibold text-foreground">{total}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const DistributionCharts = ({ stats, getLink, onNavigate }: Props) => {
  const charts: {
    title: string;
    subtitle?: string;
    chartKey: ChartKey;
    data: TDashboardDistribution[];
  }[] = [
    {
      title: "By Enrollment Method",
      subtitle: "Distribution by enrollment type",
      chartKey: "enrollmentMethod",
      data: stats.distributions.byEnrollmentMethod
    },
    {
      title: "By Algorithm",
      subtitle: "Distribution by key algorithm",
      chartKey: "algorithm",
      data: stats.distributions.byAlgorithm
    },
    {
      title: "By Issuing CA",
      subtitle: "Distribution by certificate authority",
      chartKey: "ca",
      data: stats.distributions.byCA
    }
  ];

  return (
    <>
      {charts.map((chart) => (
        <DonutChart
          key={chart.chartKey}
          title={chart.title}
          subtitle={chart.subtitle}
          chartKey={chart.chartKey}
          data={chart.data}
          getLink={getLink}
          onNavigate={onNavigate}
          getSegmentFilters={(entry) => {
            if (chart.chartKey === "enrollmentMethod" && entry.label !== "Other") {
              return { filterEnrollmentType: entry.label };
            }
            if (chart.chartKey === "algorithm" && entry.label !== "Unknown") {
              return { filterKeyAlgorithm: entry.label };
            }
            if (chart.chartKey === "ca" && entry.id) return { filterCaId: entry.id };
            return null;
          }}
        />
      ))}
    </>
  );
};
