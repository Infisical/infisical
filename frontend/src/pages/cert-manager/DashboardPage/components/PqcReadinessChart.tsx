import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

import {
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import type { TDashboardStats } from "@app/hooks/api/certificates";
import { isPqcAlgorithm } from "@app/hooks/api/certificates/constants";

import { CHART_COLORS, CHART_COLORS_HEX } from "./chart-theme";

type Props = {
  stats: TDashboardStats;
  onNavigate: (filters: Record<string, string | undefined>) => void;
};

const PQC_LABEL = "PQC-ready";
const CLASSICAL_LABEL = "Classical";

export const PqcReadinessChart = ({ stats, onNavigate }: Props) => {
  const pqcCount = stats.distributions.byAlgorithm
    .filter((d) => isPqcAlgorithm(d.label))
    .reduce((s, d) => s + d.count, 0);
  const nonPqcCount = stats.distributions.byAlgorithm
    .filter((d) => !isPqcAlgorithm(d.label))
    .reduce((s, d) => s + d.count, 0);

  const data = [
    { label: PQC_LABEL, count: pqcCount },
    { label: CLASSICAL_LABEL, count: nonPqcCount }
  ];
  const nonZeroData = data.filter((d) => d.count > 0);
  const total = pqcCount + nonPqcCount;

  const handleSegmentClick = (label: string) => {
    onNavigate({ viewId: label === PQC_LABEL ? "system-pqc" : "system-non-pqc" });
  };

  return (
    <UnstableCard className="flex h-auto w-full min-w-[280px] shrink-0 flex-col md:w-[320px]">
      <UnstableCardHeader className="pb-0">
        <UnstableCardTitle className="text-base font-semibold">PQC Readiness</UnstableCardTitle>
        <UnstableCardDescription className="text-xs">
          Post-quantum vs. classical key algorithms
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-1 items-center pt-2">
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
                          id={`grad-pqc-readiness-${idx}`}
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
                    onClick={(_entry, idx) => handleSegmentClick(nonZeroData[idx].label)}
                  >
                    {nonZeroData.map((entry, idx) => (
                      <Cell key={entry.label} fill={`url(#grad-pqc-readiness-${idx})`} />
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
                      onClick={() => handleSegmentClick(entry.label)}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-left text-foreground">
                        {entry.label}
                      </span>
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
