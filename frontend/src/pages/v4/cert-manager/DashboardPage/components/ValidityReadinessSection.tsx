import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import { Badge } from "@app/components/v4/ui/badge";
import { Card } from "@app/components/v4/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@app/components/v4/ui/chart";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { Heading, Meta, SmallText } from "@app/components/v4/ui/text";
import type { TDashboardStats } from "@app/hooks/api/certificates/types";

import { DonutCard } from "./DonutCard";

const phases = [
  { date: new Date("2026-03-15"), maxDays: 200, description: "Max validity reduced to 200 days" },
  { date: new Date("2027-03-15"), maxDays: 100, description: "Max validity reduced to 100 days" },
  { date: new Date("2029-03-15"), maxDays: 47, description: "Max validity reduced to 47 days" }
];

const validityBuckets = [
  {
    bucket: ">=200d",
    label: "200 days or more",
    hint: "Non-compliant (exceeds current limit)",
    color: "var(--v4-bad)"
  },
  {
    bucket: "100-199d",
    label: "100 to 199 days",
    hint: "Compliant until Mar 2027",
    color: "var(--v4-warn)"
  },
  {
    bucket: "48-99d",
    label: "48 to 99 days",
    hint: "Compliant until Mar 2029",
    color: "var(--v4-info)"
  },
  { bucket: "<=47d", label: "47 days or less", hint: "Fully compliant", color: "var(--v4-ok)" }
];

const renewalConfig = {
  renewals: { label: "Renewals per year", color: "var(--chart-2)" }
} satisfies ChartConfig;

const axisTick = { fill: "var(--v4-text2)", style: { fill: "var(--v4-text2)" } };

const MandateDeadlines = () => {
  const now = Date.now();
  const upcoming = phases
    .map((phase) => ({ ...phase, daysUntil: Math.ceil((phase.date.getTime() - now) / 864e5) }))
    .filter((phase) => phase.daysUntil > 0);
  return (
    <Card title="CA/B Forum mandate deadlines">
      <Stack gap={16}>
        {upcoming.map((phase) => (
          <Inline key={phase.maxDays} gap={12} justify="between" wrap={false}>
            <Stack gap={4}>
              <Inline gap={8} align="end">
                <Heading level={3} size="subsection">{`${phase.daysUntil} days`}</Heading>
                {phase.daysUntil <= 90 && <Badge tone="warn">Soon</Badge>}
              </Inline>
              <Meta>{phase.description}</Meta>
            </Stack>
            <SmallText>
              {phase.date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              })}
            </SmallText>
          </Inline>
        ))}
      </Stack>
    </Card>
  );
};

const ProjectedRenewals = ({ activeCerts }: { activeCerts: number }) => {
  const data = [
    { label: "Current", renewals: activeCerts },
    { label: "200-day", renewals: Math.ceil((365 / 200) * activeCerts) },
    { label: "100-day", renewals: Math.ceil((365 / 100) * activeCerts) },
    { label: "47-day", renewals: Math.ceil((365 / 47) * activeCerts) }
  ];
  return (
    <Card
      title="Projected annual renewals"
      description="Renewals per year at each maximum validity."
    >
      <Stack gap={8}>
        <ChartContainer
          config={renewalConfig}
          className="aspect-auto h-44 w-full"
          initialDimension={{ width: 320, height: 176 }}
        >
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ top: 20, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--v4-line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
            <YAxis
              width={36}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar
              dataKey="renewals"
              fill="var(--color-renewals)"
              maxBarSize={48}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell
                  key={entry.label}
                  fill={index === 0 ? "var(--chart-1)" : "var(--color-renewals)"}
                />
              ))}
              <LabelList dataKey="renewals" position="top" fill="var(--v4-ink)" />
            </Bar>
          </BarChart>
        </ChartContainer>
        <SmallText>
          {`Based on ${activeCerts.toLocaleString()} active certificate${activeCerts === 1 ? "" : "s"}`}
        </SmallText>
      </Stack>
    </Card>
  );
};

export const ValidityReadinessSection = ({ stats }: { stats: TDashboardStats }) => {
  const buckets = new Map(
    (stats.validityBuckets ?? []).map((entry) => [entry.bucket, entry.count])
  );
  const tlsActiveCerts = [...buckets.values()].reduce((sum, count) => sum + count, 0);
  if (tlsActiveCerts === 0) return null;
  return (
    <Stack gap={16}>
      <Heading level={2}>47-day validity readiness</Heading>
      <Grid gap={16} columns={3}>
        <MandateDeadlines />
        <ProjectedRenewals activeCerts={tlsActiveCerts} />
        <DonutCard
          title="Certificates by validity period"
          description="Active certificates by issue-to-expiry duration."
          stacked
          slices={validityBuckets.map((entry) => ({
            label: entry.label,
            hint: entry.hint,
            color: entry.color,
            count: buckets.get(entry.bucket) ?? 0
          }))}
        />
      </Grid>
    </Stack>
  );
};
