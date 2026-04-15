import { useMemo } from "react";
import {
  Bar,
  BarChart,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import type { TDashboardStats } from "@app/hooks/api/certificates";

import { CHART_COLORS, CHART_COLORS_HEX } from "./chart-theme";

type Props = {
  stats: TDashboardStats;
};

const ALL_PHASES = [
  {
    date: new Date("2026-03-15"),
    maxDays: 200,
    description: "Max validity reduced to 200 days"
  },
  {
    date: new Date("2027-03-15"),
    maxDays: 100,
    description: "Max validity reduced to 100 days"
  },
  {
    date: new Date("2029-03-15"),
    maxDays: 47,
    description: "Max validity reduced to 47 days"
  }
];

const VALIDITY_BUCKET_CONFIG: Record<string, { label: string; compliance: string; color: string }> =
  {
    ">=200d": {
      label: "> 200 days",
      compliance: "Non-compliant (exceeds current limit)",
      color: CHART_COLORS_HEX[7]
    },
    "100-199d": {
      label: "100\u2013199 days",
      compliance: "Compliant until Mar 2027",
      color: CHART_COLORS_HEX[1]
    },
    "48-99d": {
      label: "48\u201399 days",
      compliance: "Compliant until Mar 2029",
      color: CHART_COLORS_HEX[0]
    },
    "<=47d": {
      label: "\u2264 47 days",
      compliance: "Fully compliant",
      color: CHART_COLORS_HEX[5]
    }
  };

const BUCKET_ORDER = [">=200d", "100-199d", "48-99d", "<=47d"];

const MandateCountdown = () => {
  const now = Date.now();
  const futurePhases = ALL_PHASES.filter(
    (p) => Math.ceil((p.date.getTime() - now) / (1000 * 60 * 60 * 24)) > 0
  );

  return (
    <UnstableCard className="flex h-full flex-col">
      <UnstableCardHeader className="pb-2">
        <UnstableCardTitle className="text-base font-semibold">
          CA/B Forum Mandate Deadlines
        </UnstableCardTitle>
        <p className="mt-0.5 text-xs text-muted">
          Upcoming reductions in maximum TLS certificate validity
        </p>
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-1 flex-col justify-center pt-2">
        <div className="space-y-2">
          {futurePhases.map((phase) => {
            const daysUntil = Math.ceil((phase.date.getTime() - now) / (1000 * 60 * 60 * 24));
            const isUrgent = daysUntil <= 90;

            const [, colorWarning, , , , colorSuccess] = CHART_COLORS;
            const barColor = isUrgent ? colorWarning : colorSuccess;

            return (
              <div
                key={phase.maxDays}
                className="flex items-center gap-3 rounded-md border border-border bg-foreground/[0.02] px-3 py-2"
              >
                <div
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: barColor }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-foreground">{daysUntil}</span>
                    <span className="text-sm text-accent">days</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{phase.description}</p>
                </div>
                <p className="shrink-0 text-right text-xs text-foreground/70">
                  {phase.date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  })}
                </p>
              </div>
            );
          })}
        </div>
      </UnstableCardContent>
    </UnstableCard>
  );
};

const ProjectedRenewals = ({ activeCerts }: { activeCerts: number }) => {
  const data = useMemo(() => {
    if (activeCerts === 0) return [];
    return [
      { label: "Current", renewals: activeCerts, color: CHART_COLORS_HEX[0] },
      {
        label: "200-day",
        renewals: Math.ceil((365 / 200) * activeCerts),
        color: CHART_COLORS_HEX[1]
      },
      {
        label: "100-day",
        renewals: Math.ceil((365 / 100) * activeCerts),
        color: CHART_COLORS_HEX[6]
      },
      {
        label: "47-day",
        renewals: Math.ceil((365 / 47) * activeCerts),
        color: CHART_COLORS_HEX[7]
      }
    ];
  }, [activeCerts]);

  if (activeCerts === 0) return null;

  return (
    <UnstableCard className="flex h-full flex-col">
      <UnstableCardHeader className="pb-0">
        <UnstableCardTitle className="text-base font-semibold">
          Projected Annual Renewals
        </UnstableCardTitle>
        <p className="mt-0.5 text-xs text-muted">
          Estimated yearly renewal volume under each validity regime
        </p>
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-1 flex-col justify-end pt-4">
        <ResponsiveContainer width="100%" height={170}>
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-muted)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <RechartsTooltip
              contentStyle={{
                backgroundColor: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: "6px",
                color: "var(--color-foreground)"
              }}
              itemStyle={{ color: "var(--color-foreground)" }}
              labelStyle={{ color: "var(--color-foreground)" }}
              formatter={(value) => [Number(value).toLocaleString(), "Renewals/year"]}
              cursor={{ fill: "none" }}
            />
            <defs>
              {data.map((entry) => (
                <linearGradient
                  key={`grad-bar-${entry.label}`}
                  id={`grad-bar-${entry.label}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={entry.color} stopOpacity={1} />
                  <stop offset="100%" stopColor={entry.color} stopOpacity={0.5} />
                </linearGradient>
              ))}
            </defs>
            <Bar dataKey="renewals" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry) => (
                <Cell key={`bar-${entry.label}`} fill={`url(#grad-bar-${entry.label})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-center text-xs text-muted">
          Based on {activeCerts.toLocaleString()} active certificate{activeCerts !== 1 ? "s" : ""}
        </p>
      </UnstableCardContent>
    </UnstableCard>
  );
};

const ValidityDistribution = ({ buckets }: { buckets: TDashboardStats["validityBuckets"] }) => {
  const chartData = useMemo(() => {
    if (!buckets) return [];
    const bucketMap = new Map(buckets.map((b) => [b.bucket, b.count]));
    return BUCKET_ORDER.map((key, idx) => ({
      bucket: key,
      count: bucketMap.get(key) || 0,
      segIdx: idx,
      ...VALIDITY_BUCKET_CONFIG[key]
    })).filter((d) => d.count > 0);
  }, [buckets]);

  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) return null;

  return (
    <UnstableCard className="flex h-full flex-col">
      <UnstableCardHeader className="pb-0">
        <UnstableCardTitle className="text-base font-semibold">
          Certificates by Validity Period
        </UnstableCardTitle>
        <p className="mt-0.5 text-xs text-muted">
          Active certificates grouped by issuance-to-expiry duration
        </p>
      </UnstableCardHeader>
      <UnstableCardContent className="flex flex-1 items-center pt-2">
        <div className="flex w-full items-center gap-3">
          <div className="w-[120px] shrink-0">
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <defs>
                  {chartData.map((item) => (
                    <linearGradient
                      key={`grad-val-${item.segIdx}`}
                      id={`grad-val-${item.segIdx}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={item.color} stopOpacity={1} />
                      <stop offset="100%" stopColor={item.color} stopOpacity={0.6} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={chartData}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={52}
                  paddingAngle={2}
                  stroke="none"
                >
                  {chartData.map((item) => (
                    <Cell key={item.bucket} fill={`url(#grad-val-${item.segIdx})`} />
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
              {chartData.map((item) => {
                const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                return (
                  <div
                    key={item.bucket}
                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="min-w-0 flex-1 truncate text-left text-foreground">
                          {item.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">{item.compliance}</TooltipContent>
                    </Tooltip>
                    <span className="shrink-0 text-right text-muted">{pct}%</span>
                    <span className="shrink-0 text-right font-medium text-foreground">
                      {item.count}
                    </span>
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
      </UnstableCardContent>
    </UnstableCard>
  );
};

export const ValidityReadinessSection = ({ stats }: Props) => {
  const tlsActiveCerts = useMemo(
    () => (stats.validityBuckets || []).reduce((sum, b) => sum + b.count, 0),
    [stats.validityBuckets]
  );

  if (tlsActiveCerts === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">47-Day Validity Readiness</h2>
      <div className="grid auto-rows-[1fr] grid-cols-1 gap-4 xl:grid-cols-3">
        <MandateCountdown />
        <ProjectedRenewals activeCerts={tlsActiveCerts} />
        <ValidityDistribution buckets={stats.validityBuckets} />
      </div>
    </div>
  );
};
