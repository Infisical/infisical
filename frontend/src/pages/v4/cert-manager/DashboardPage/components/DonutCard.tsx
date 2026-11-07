import { useNavigate, useParams } from "@tanstack/react-router";
import { Cell, Pie, PieChart } from "recharts";

import { Card } from "@app/components/v4/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@app/components/v4/ui/chart";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Inline } from "@app/components/v4/ui/layout";
import { RowLink } from "@app/components/v4/ui/row-link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v4/ui/table";

import { formatShare, type InventoryFilters } from "./dashboard.utils";

export type DonutSlice = {
  label: string;
  count: number;
  color: string;
  hint?: string;
  filters?: InventoryFilters;
};

const inventory = "/v4/organizations/$orgId/cert-manager/inventory";

export const DonutCard = ({
  title,
  description,
  slices,
  emptyTitle = "No data available",
  stacked = false
}: {
  title: string;
  description: string;
  slices: DonutSlice[];
  emptyTitle?: string;
  stacked?: boolean;
}) => {
  const { orgId } = useParams({ from: "/v4/organizations/$orgId" });
  const navigate = useNavigate();
  const keyed = slices.map((slice, index) => ({ ...slice, key: `s${index}` }));
  const plotted = keyed.filter((slice) => slice.count > 0);
  const total = keyed.reduce((sum, slice) => sum + slice.count, 0);
  const config: ChartConfig = Object.fromEntries(
    keyed.map((slice) => [slice.key, { label: slice.label, color: slice.color }])
  );

  return (
    <Card variant="framed" title={title} description={description}>
      {plotted.length === 0 ? (
        <EmptyState size="sm" icon="cert" title={emptyTitle} />
      ) : (
        <Inline gap={24} align="center" justify={stacked ? "center" : "start"} wrap={stacked}>
          <ChartContainer
            config={config}
            className="aspect-square h-32 shrink-0"
            initialDimension={{ width: 128, height: 128 }}
          >
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="key" />} />
              <Pie
                data={plotted}
                dataKey="count"
                nameKey="key"
                innerRadius={36}
                outerRadius={60}
                paddingAngle={2}
                stroke="none"
                isAnimationActive={false}
                onClick={(_entry, index) => {
                  const { filters } = plotted[index];
                  if (filters) navigate({ to: inventory, params: { orgId }, search: filters });
                }}
              >
                {plotted.map((slice) => (
                  <Cell
                    key={slice.key}
                    fill={`var(--color-${slice.key})`}
                    // v4-check-ignore cursor-pointer -- a slice with filters opens the filtered inventory, so it reads as a link
                    cursor={slice.filters ? "pointer" : undefined}
                  />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
          <Table aria-label={`${title} breakdown`}>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Share</TableHead>
                <TableHead>Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plotted.map((slice) => {
                const name = <span title={slice.hint}>{slice.label}</span>;
                return (
                  <TableRow key={slice.key} className="relative">
                    <TableCell>
                      <Inline gap={8} wrap={false}>
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0"
                          style={{ background: slice.color }}
                        />
                        {slice.filters ? (
                          <RowLink to={inventory} params={{ orgId }} search={slice.filters}>
                            {slice.label}
                          </RowLink>
                        ) : (
                          name
                        )}
                      </Inline>
                    </TableCell>
                    <TableCell>{formatShare(slice.count, total)}</TableCell>
                    <TableCell>{slice.count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell />
                <TableCell>{total}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Inline>
      )}
    </Card>
  );
};
