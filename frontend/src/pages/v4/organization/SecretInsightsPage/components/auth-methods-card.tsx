import { Alert } from "@infisical/cipher/ui/alert";
import { Card } from "@infisical/cipher/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  chartSeries,
  ChartTooltip,
  ChartTooltipContent
} from "@infisical/cipher/ui/chart";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { FingerprintIcon } from "lucide-react";
import { Bar, BarChart, XAxis, YAxis } from "recharts";

import { identityAuthToNameMap } from "@app/hooks/api/identities/constants";
import { IdentityAuthMethod } from "@app/hooks/api/identities/enums";
import type { TOrgAuthMethodUsage } from "@app/hooks/api/secretInsights/types";

type Segment = { key: string; label: string; count: number; share: number; color: string };

const authMethodName = (authMethod: string) =>
  identityAuthToNameMap[authMethod as IdentityAuthMethod] ??
  authMethod
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const columns: DataTableColumn<Segment>[] = [
  {
    id: "method",
    header: "Auth Method",
    primary: true,
    grow: true,
    text: (segment) => segment.label,
    render: (segment) => (
      <Inline gap={8} wrap={false}>
        <span
          aria-hidden="true"
          className="size-2.5 shrink-0"
          style={{ background: segment.color }}
        />
        {segment.label}
      </Inline>
    )
  },
  {
    id: "fetches",
    header: "Fetches",
    align: "end",
    width: 140,
    render: (segment) => segment.count.toLocaleString()
  },
  {
    id: "share",
    header: "Share",
    align: "end",
    width: 96,
    render: (segment) => `${Math.round(segment.share)}%`
  }
];

export const AuthMethodsCard = ({ data }: { data: TOrgAuthMethodUsage }) => {
  const segments: Segment[] =
    data.totalFetches === 0
      ? []
      : [...data.methods]
          .sort((a, b) => b.count - a.count)
          .map((method, index) => ({
            key: `m${index}`,
            label: authMethodName(method.authMethod),
            count: method.count,
            share: (method.count / data.totalFetches) * 100,
            color: chartSeries[index % chartSeries.length]
          }));
  const staticTokenCount =
    data.methods.find((method) => method.authMethod === IdentityAuthMethod.TOKEN_AUTH)?.count ?? 0;
  const staticTokenShare = data.totalFetches ? (staticTokenCount / data.totalFetches) * 100 : 0;
  const config: ChartConfig = Object.fromEntries(
    segments.map((segment) => [segment.key, { label: segment.label, color: segment.color }])
  );

  return (
    <Card
      variant="framed"
      title="Auth Methods Used to Fetch Secrets"
      hint="Share of authenticated fetches by machine identity auth method, past 7 days."
    >
      {segments.length === 0 ? (
        <EmptyState
          size="sm"
          icon={FingerprintIcon}
          title="No secret fetches in the past 7 days"
          description="Once a machine identity reads a secret, its auth method appears here."
        />
      ) : (
        <Stack gap={16}>
          <ChartContainer config={config} height={12} initialDimension={{ width: 640, height: 12 }}>
            <BarChart
              accessibilityLayer
              layout="vertical"
              data={[Object.fromEntries(segments.map((segment) => [segment.key, segment.count]))]}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              barCategoryGap={0}
            >
              <XAxis type="number" hide domain={[0, data.totalFetches]} />
              <YAxis type="category" hide />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              {segments.map((segment) => (
                <Bar
                  key={segment.key}
                  dataKey={segment.key}
                  stackId="share"
                  fill={`var(--color-${segment.key})`}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <DataTable
            label="Auth methods"
            rows={segments}
            columns={columns}
            getRowId={(segment) => segment.key}
            rowLabel={(segment) => segment.label}
          />
          {staticTokenShare > 0 && (
            <Alert tone="warn">
              {`${Math.round(staticTokenShare)}% of fetches still use static tokens. Migrate those identities to a workload auth method to remove long-lived credentials.`}
            </Alert>
          )}
        </Stack>
      )}
    </Card>
  );
};
