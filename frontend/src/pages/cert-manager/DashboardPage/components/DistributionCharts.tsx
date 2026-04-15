import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import type { TDashboardDistribution, TDashboardStats } from "@app/hooks/api/certificates";
import { certKeyAlgorithmToNameMap } from "@app/hooks/api/certificates/constants";

import { CHART_COLORS, CHART_COLORS_HEX } from "./chart-theme";

type Props = {
  stats: TDashboardStats;
  onNavigate: (filters: Record<string, string | undefined>) => void;
};

type ChartKey = "enrollmentMethod" | "algorithm" | "ca";

const DonutChart = ({
  title,
  subtitle,
  data,
  chartKey,
  onSegmentClick
}: {
  title: string;
  subtitle?: string;
  data: TDashboardDistribution[];
  chartKey: ChartKey;
  onSegmentClick?: (entry: TDashboardDistribution) => void;
}) => {
  const nonZeroData = data.filter((d) => d.count > 0);
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const chartId = title.replace(/\s+/g, "-").toLowerCase();
  const formatLabel = (label: string) => {
    if (chartKey === "algorithm") {
      return (
        (certKeyAlgorithmToNameMap as Record<string, string>)[label] ?? label.replace(/_/g, " ")
      );
    }
    if (chartKey === "enrollmentMethod") return label.toUpperCase();
    return label;
  };

  return (
    <UnstableCard className="flex min-w-[250px] flex-1 flex-col">
      <UnstableCardHeader className="pb-0">
        <UnstableCardTitle className="text-base font-semibold">{title}</UnstableCardTitle>
        {subtitle && (
          <UnstableCardDescription className="text-xs">{subtitle}</UnstableCardDescription>
        )}
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-1 items-end pt-2">
        {nonZeroData.length === 0 ? (
          <UnstableEmpty className="h-[200px]">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No data available</UnstableEmptyTitle>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <div className="flex w-full items-center gap-3">
            <div className="w-[120px] shrink-0">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <defs>
                    {nonZeroData.map((entry, idx) => {
                      const hex = CHART_COLORS_HEX[idx % CHART_COLORS_HEX.length];
                      return (
                        <linearGradient
                          key={`grad-${entry.label}`}
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
                    onClick={(_entry, idx) => onSegmentClick?.(nonZeroData[idx])}
                  >
                    {nonZeroData.map((entry, idx) => (
                      <Cell key={entry.label} fill={`url(#grad-${chartId}-${idx})`} />
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
                  const pct = total > 0 ? Math.round((entry.count / total) * 100) : 0;
                  return (
                    <button
                      key={entry.label}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-foreground/5"
                      onClick={() => onSegmentClick?.(entry)}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="min-w-0 flex-1 truncate text-left text-foreground">
                            {formatLabel(entry.label)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{formatLabel(entry.label)}</TooltipContent>
                      </Tooltip>
                      <span className="shrink-0 text-right text-muted">{pct}%</span>
                      <span className="shrink-0 text-right font-medium text-foreground">
                        {entry.count}
                      </span>
                    </button>
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
      </UnstableCardContent>
    </UnstableCard>
  );
};

export const DistributionCharts = ({ stats, onNavigate }: Props) => {
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
          onSegmentClick={(entry) => {
            if (chart.chartKey === "enrollmentMethod") {
              onNavigate({ filterEnrollmentType: entry.label });
            } else if (chart.chartKey === "algorithm") {
              onNavigate({ filterKeyAlgorithm: entry.label });
            } else if (chart.chartKey === "ca" && entry.id) {
              onNavigate({ filterCaId: entry.id });
            }
          }}
        />
      ))}
    </>
  );
};
