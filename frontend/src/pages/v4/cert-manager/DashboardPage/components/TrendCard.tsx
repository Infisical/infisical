import type { ReactNode } from "react";
import { Card } from "@infisical/cipher/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from "@infisical/cipher/ui/chart";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { SmallText } from "@infisical/cipher/ui/text";
import { ToggleGroup, ToggleGroupItem } from "@infisical/cipher/ui/toggle-group";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { formatTickLabel, ranges } from "./dashboard.utils";

export type TrendSeries = { key: string; label: string; color: string; dashed?: boolean };

const axisTick = { fill: "var(--cipher-text2)", style: { fill: "var(--cipher-text2)" } };

export const TrendCard = <TPoint extends { period: string }>({
  title,
  description,
  data,
  series,
  range,
  onRangeChange,
  emptyTitle,
  controls
}: {
  title: string;
  description?: string;
  data?: TPoint[];
  series: TrendSeries[];
  range: string;
  onRangeChange: (range: string) => void;
  emptyTitle: string;
  controls?: ReactNode;
}) => {
  const config: ChartConfig = Object.fromEntries(
    series.map((entry) => [entry.key, { label: entry.label, color: entry.color }])
  );
  const value = (point: TPoint, key: string) =>
    Number((point as Record<string, unknown>)[key] ?? 0);
  const totals = series.map((entry) => ({
    ...entry,
    total: (data ?? []).reduce((sum, point) => sum + value(point, entry.key), 0)
  }));
  const hasAnyData = totals.some((entry) => entry.total > 0);
  const label = ranges.find((entry) => entry.value === range)?.label ?? range;

  let body: ReactNode;
  if (!data) body = <Skeleton height={256} />;
  else if (!hasAnyData) body = <EmptyState size="sm" icon="history" title={emptyTitle} />;
  else
    body = (
      <Stack gap={8}>
        <ChartContainer
          config={config}
          className="aspect-auto h-64 w-full"
          initialDimension={{ width: 640, height: 256 }}
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--cipher-line)" />
            <XAxis
              dataKey="period"
              tickFormatter={formatTickLabel}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={axisTick}
            />
            <YAxis
              width={36}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent labelFormatter={(period) => formatTickLabel(String(period))} />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            {series.map((entry) => (
              <Line
                key={entry.key}
                type="monotone"
                dataKey={entry.key}
                stroke={`var(--color-${entry.key})`}
                strokeWidth={2}
                strokeDasharray={entry.dashed ? "4 2" : undefined}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ChartContainer>
        <SmallText>
          {`Last ${label}: ${totals.map((entry) => `${entry.label} ${entry.total}`).join(", ")}.`}
        </SmallText>
      </Stack>
    );

  return (
    <Card
      variant="framed"
      title={title}
      description={description}
      action={
        <Inline gap={8} wrap={false}>
          <ToggleGroup
            type="single"
            size="sm"
            value={range}
            aria-label={`${title} period`}
            onValueChange={(next) => next && onRangeChange(next)}
          >
            {ranges.map((entry) => (
              <ToggleGroupItem key={entry.value} value={entry.value}>
                {entry.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {controls}
        </Inline>
      }
    >
      {body}
    </Card>
  );
};
