import { Card } from "@infisical/cipher/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@infisical/cipher/ui/chart";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { format, parseISO } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import type { TOrgStaticSecretUsage } from "@app/hooks/api/secretInsights/types";

type WeekPoint = { label: string; weekLabel: string; created: number; isPartial: boolean };

const axisTick = { fill: "var(--cipher-text2)", style: { fill: "var(--cipher-text2)" } };
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const config: ChartConfig = { created: { label: "Secrets created", color: "var(--chart-1)" } };

export const NewSecretsCard = ({ data }: { data: TOrgStaticSecretUsage }) => {
  const weeks: WeekPoint[] = data.weeks.map((week) => ({
    label: format(parseISO(week.weekStart), "MMM d"),
    weekLabel: format(parseISO(week.weekStart), "MMMM d"),
    created: week.totalSecrets,
    isPartial: week.isPartial
  }));

  return (
    <Card
      variant="framed"
      title="New Secrets Created"
      hint="Secrets created across all projects, past 12 weeks."
    >
      {weeks.length === 0 ? (
        <EmptyState size="sm" icon="key" title="No secrets created in the past 12 weeks" />
      ) : (
        <ChartContainer config={config} height={240} initialDimension={{ width: 640, height: 240 }}>
          <BarChart
            accessibilityLayer
            data={weeks}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--cipher-line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={16}
              tick={axisTick}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              tickFormatter={(value: number) => compact.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => {
                    const week = payload[0]?.payload as WeekPoint | undefined;
                    if (!week) return null;
                    return `Week of ${week.weekLabel}${week.isPartial ? ", in progress" : ""}`;
                  }}
                />
              }
            />
            <Bar dataKey="created" maxBarSize={32} isAnimationActive={false}>
              {weeks.map((week) => (
                <Cell
                  key={week.label}
                  fill="var(--color-created)"
                  fillOpacity={week.isPartial ? 0.4 : 1}
                  stroke={week.isPartial ? "var(--color-created)" : undefined}
                  strokeDasharray={week.isPartial ? "3 3" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
};
