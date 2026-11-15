import { Card } from "@infisical/cipher/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  chartSeries
} from "@infisical/cipher/ui/chart";
import { DataTable } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { FieldHelp } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Skeleton } from "@infisical/cipher/ui/skeleton";
import { Cell, Pie, PieChart } from "recharts";

import { useV4Adapter } from "../../data/adapters";

const PALETTE = [
  ...chartSeries,
  "var(--cipher-ok)",
  "var(--cipher-warn)",
  "var(--cipher-bad)",
  "var(--cipher-info)"
];

const share = (count: number, total: number) =>
  `${total > 0 ? Math.round((count / total) * 100) : 0}%`;

export const AuthMethodCard = ({ projectId }: { projectId: string }) => {
  const { data, isPending } = useV4Adapter("secretInsights").useAuthMethodDistribution({
    projectId,
    days: 30
  });
  const methods = (data?.methods ?? []).map((method, index) => ({
    ...method,
    key: `m${index}`,
    color: PALETTE[index % PALETTE.length]
  }));
  const total = methods.reduce((sum, method) => sum + method.count, 0);
  const config: ChartConfig = Object.fromEntries(
    methods.map((method) => [method.key, { label: method.method, color: method.color }])
  );

  let body;
  if (isPending) body = <Skeleton height={260} />;
  else if (methods.length === 0)
    body = <EmptyState size="sm" icon="key" title="No secret access data available" />;
  else
    body = (
      <Stack gap={16}>
        <Inline justify="center">
          <ChartContainer
            config={config}
            className="aspect-square h-56 shrink-0"
            initialDimension={{ width: 224, height: 224 }}
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
              <Pie
                data={methods}
                dataKey="count"
                nameKey="key"
                innerRadius={58}
                outerRadius={100}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
              >
                {methods.map((method) => (
                  <Cell key={method.key} fill={`var(--color-${method.key})`} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        </Inline>
        <DataTable
          label="Authentication methods"
          rows={methods}
          getRowId={(method) => method.key}
          rowLabel={(method) => method.method}
          columns={[
            {
              id: "method",
              header: "Method",
              primary: true,
              grow: true,
              text: (method) => method.method,
              footer: "Total",
              render: (method) => (
                <Inline gap={8} align="center" wrap={false}>
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0"
                    style={{ background: method.color }}
                  />
                  <span>{method.method}</span>
                  {method.method === "Unknown" && (
                    <FieldHelp>
                      Only new requests record the auth method. Older requests may not have it.
                    </FieldHelp>
                  )}
                </Inline>
              )
            },
            {
              id: "share",
              header: "Share",
              width: 80,
              align: "end",
              text: (method) => share(method.count, total),
              render: (method) => share(method.count, total)
            },
            {
              id: "count",
              header: "Requests",
              width: 112,
              align: "end",
              text: (method) => method.count.toLocaleString(),
              render: (method) => method.count.toLocaleString(),
              footer: total.toLocaleString()
            }
          ]}
        />
      </Stack>
    );

  return (
    <Card
      title="Authentication Methods"
      description="Auth methods used for secret access over the past 30 days."
    >
      {body}
    </Card>
  );
};
