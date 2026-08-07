import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  TBadgeProps
} from "@app/components/v3";
import { TOrgStaticSecretUsage } from "@app/hooks/api";

const BAR_GRADIENT_ID = "org-static-secrets-bar";

type TrendBadge = { label: string; variant: TBadgeProps["variant"] };

type WeekPoint = {
  label: string;
  weekLabel: string;
  created: number;
  isPartial: boolean;
};

const getCreationTrend = (weeks: TOrgStaticSecretUsage["weeks"]): TrendBadge | null => {
  if (weeks.length < 3) return null;
  const [a, b, c] = weeks.slice(-3).map((week) => week.totalSecrets);
  if (a < b && b < c) return { label: "Increasing", variant: "warning" };
  if (a > b && b > c) return { label: "Decreasing", variant: "success" };
  return { label: "Steady", variant: "neutral" };
};

const ChartTooltip = ({
  active,
  payload
}: {
  active?: boolean;
  payload?: { payload: WeekPoint }[];
}) => {
  if (!active || !payload?.length) return null;
  const week = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs">
      <div className="font-medium text-foreground">Week of {week.weekLabel}</div>
      <div className="mt-0.5 text-label">
        {week.created.toLocaleString()} {week.created === 1 ? "secret" : "secrets"} created
      </div>
      {week.isPartial && <div className="mt-0.5 text-warning">Week in progress</div>}
    </div>
  );
};

export const StaticSecretPresenceCard = ({ data }: { data: TOrgStaticSecretUsage }) => {
  const weeks = useMemo<WeekPoint[]>(
    () =>
      data.weeks.map((week) => ({
        label: format(parseISO(week.weekStart), "MMM d"),
        weekLabel: format(parseISO(week.weekStart), "MMMM d"),
        created: week.totalSecrets,
        isPartial: week.isPartial
      })),
    [data.weeks]
  );

  const trend = useMemo(() => getCreationTrend(data.weeks), [data.weeks]);

  return (
    // h-full lets the card stretch to match AuthMethodsCard when they share a grid row
    // (the Card base class is h-fit, which would otherwise opt out of the stretch)
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Static Secret Presence</CardTitle>
        <CardDescription>
          Static secrets created across all projects, past 12 weeks.
        </CardDescription>
        {trend && (
          <CardAction>
            <Badge variant={trend.variant}>
              {trend.label === "Decreasing" && <TrendingDownIcon />}
              {trend.label === "Increasing" && <TrendingUpIcon />}
              {trend.label}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {weeks.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No secret creation data yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {weeks.length > 0 && (
          <div className="min-h-[240px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--color-label)" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-label)" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "var(--color-foreground)", fillOpacity: 0.04 }}
                  isAnimationActive={false}
                />
                <defs>
                  <linearGradient id={BAR_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-info)" stopOpacity={1} />
                    <stop offset="100%" stopColor="var(--color-info)" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <Bar dataKey="created" radius={[4, 4, 0, 0]} maxBarSize={32}>
                  {weeks.map((week) => (
                    <Cell
                      key={week.label}
                      fill={`url(#${BAR_GRADIENT_ID})`}
                      fillOpacity={week.isPartial ? 0.4 : 1}
                      stroke={week.isPartial ? "var(--color-info)" : undefined}
                      strokeDasharray={week.isPartial ? "3 3" : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
