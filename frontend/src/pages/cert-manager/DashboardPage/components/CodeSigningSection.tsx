import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  Button,
  ButtonGroup,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyTitle
} from "@app/components/v3";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import {
  SigningActivityOrderBy,
  SigningOperationStatus,
  signingOperationStatusLabels,
  TGetSigningActivityTrendDTO,
  useGetSigningActivityBySigner,
  useGetSigningActivityTrend,
  useListSigners
} from "@app/hooks/api/signers";

import {
  CHART_COLORS_HEX,
  CHART_OTHER_COLOR,
  formatTickLabel,
  nonZeroDot,
  TREND_COLORS
} from "./chart-theme";
import {
  SigningActivityLegend,
  SigningActivitySeries,
  SigningActivityView
} from "./SigningActivityLegend";
import { SignerOption, SigningActivitySignerPicker } from "./SigningActivitySignerPicker";

type Props = {
  projectId: string;
};

const OTHER_SERIES_KEY = "__other__";
const DIMMED_LINE_OPACITY = 0.15;
const MIN_Y_AXIS_MAX = 4;

const ranges: { label: string; value: TGetSigningActivityTrendDTO["range"] }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "6M", value: "6m" }
];

const sumBy = <T,>(items: T[], getValue: (item: T) => number) =>
  items.reduce((sum, item) => sum + getValue(item), 0);

export const CodeSigningSection = ({ projectId }: Props) => {
  const { data: signerCountData } = useListSigners({ projectId, limit: 1 });
  const signerCount = signerCountData?.totalCount ?? 0;

  const [selectedSigners, setSelectedSigners] = useState<SignerOption[]>([]);
  const [currentRange, setCurrentRange] = useState<TGetSigningActivityTrendDTO["range"]>("30d");
  const [view, setView] = useState(SigningActivityView.Signer);
  const [isolatedKey, setIsolatedKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [orderBy, setOrderBy] = useState(SigningActivityOrderBy.Total);
  const [orderDirection, setOrderDirection] = useState(OrderByDirection.DESC);

  const selectedSignerIds = selectedSigners.length
    ? selectedSigners.map(({ id }) => id)
    : undefined;

  const { data: trendData = [], isError: isTrendError } = useGetSigningActivityTrend(
    { range: currentRange, signerIds: selectedSignerIds },
    { enabled: signerCount > 0 }
  );
  const { data: allSignersData } = useGetSigningActivityBySigner(
    {
      projectId,
      range: currentRange,
      orderBy: SigningActivityOrderBy.Total,
      orderDirection: OrderByDirection.DESC
    },
    { enabled: signerCount > 0 }
  );
  const { data: bySignerData, isError: isBySignerError } = useGetSigningActivityBySigner(
    { projectId, range: currentRange, signerIds: selectedSignerIds, orderBy, orderDirection },
    { enabled: signerCount > 0 }
  );

  if (signerCount === 0) {
    return null;
  }

  const signerRows = (bySignerData?.signerTotals ?? []).map((signer) => ({
    key: signer.signerId,
    label: signer.signerName,
    failed: signer.failed,
    total: signer.success + signer.failed
  }));
  const chartedCount = Object.keys(bySignerData?.periods[0]?.signerCounts ?? {}).length;
  const foldedRows = signerRows.slice(chartedCount);
  const signerSeries: SigningActivitySeries[] = signerRows
    .slice(0, chartedCount)
    .map((row, idx) => ({ ...row, color: CHART_COLORS_HEX[idx] }));
  if (foldedRows.length) {
    signerSeries.push({
      key: OTHER_SERIES_KEY,
      label: "Other",
      color: CHART_OTHER_COLOR,
      failed: sumBy(foldedRows, (row) => row.failed),
      total: sumBy(foldedRows, (row) => row.total),
      groupedCount: foldedRows.length
    });
  }

  const statusFailed = sumBy(trendData, (period) => period.failed);
  const statusSeries: SigningActivitySeries[] = [
    {
      key: SigningOperationStatus.Success,
      label: signingOperationStatusLabels[SigningOperationStatus.Success],
      color: TREND_COLORS.renewed,
      failed: 0,
      total: sumBy(trendData, (period) => period.success)
    },
    {
      key: SigningOperationStatus.Failed,
      label: signingOperationStatusLabels[SigningOperationStatus.Failed],
      color: TREND_COLORS.expired,
      failed: statusFailed,
      total: statusFailed
    }
  ];

  const activityCounts = new Map(
    (allSignersData?.signerTotals ?? []).map((signer) => [
      signer.signerId,
      signer.success + signer.failed
    ])
  );

  const isSignerView = view === SigningActivityView.Signer;
  const series = isSignerView ? signerSeries : statusSeries;
  const chartData: Record<string, string | number>[] = isSignerView
    ? (bySignerData?.periods ?? []).map(({ period, signerCounts, otherCount }) => ({
        period,
        ...signerCounts,
        [OTHER_SERIES_KEY]: otherCount
      }))
    : trendData;
  const legendTotal = sumBy(series, (row) => row.total);
  const findSeriesKey = (key: string | null) => series.find((row) => row.key === key)?.key ?? null;
  const activeIsolatedKey = findSeriesKey(isolatedKey);
  const focusKey = activeIsolatedKey ?? findSeriesKey(hoveredKey);

  const changeView = (nextView: SigningActivityView) => {
    setView(nextView);
    setIsolatedKey(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Code Signing Activity</CardTitle>
        <CardDescription>
          {selectedSigners.length === 1 && `Signing operations for ${selectedSigners[0].name}`}
          {selectedSigners.length > 1 &&
            `Signing operations for ${selectedSigners.length} selected signers`}
          {!selectedSigners.length &&
            `Signing operations across ${signerCount} ${signerCount === 1 ? "signer" : "signers"}`}
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ButtonGroup>
              <Button
                size="xs"
                variant={isSignerView ? "outline" : "neutral"}
                onClick={() => changeView(SigningActivityView.Status)}
              >
                By Status
              </Button>
              <Button
                size="xs"
                variant={isSignerView ? "neutral" : "outline"}
                onClick={() => changeView(SigningActivityView.Signer)}
              >
                By Signer
              </Button>
            </ButtonGroup>
            <div className="flex gap-0.5">
              {ranges.map((r) => (
                <Button
                  key={r.value}
                  size="xs"
                  variant={currentRange === r.value ? "neutral" : "ghost"}
                  onClick={() => {
                    setCurrentRange(r.value);
                    setIsolatedKey(null);
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <SigningActivitySignerPicker
              projectId={projectId}
              value={selectedSigners}
              onChange={(signers) => {
                setSelectedSigners(signers);
                setIsolatedKey(null);
              }}
              activityCounts={activityCounts}
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {(isSignerView ? isBySignerError : isTrendError) ? (
          <Empty className="h-[260px]">
            <EmptyTitle>Could not load signing activity</EmptyTitle>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis
                    dataKey="period"
                    tickFormatter={formatTickLabel}
                    tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                  />
                  <YAxis
                    tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                    axisLine={{ stroke: "var(--color-border)" }}
                    allowDecimals={false}
                    domain={[0, (dataMax: number) => Math.max(dataMax, MIN_Y_AXIS_MAX)]}
                  />
                  <RechartsTooltip
                    itemSorter={(item) => -Number(item.value ?? 0)}
                    labelFormatter={(label) => formatTickLabel(String(label))}
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: "6px",
                      color: "var(--color-foreground)"
                    }}
                  />
                  {series.map((row) => {
                    const isDimmed = Boolean(focusKey) && focusKey !== row.key;
                    return (
                      <Line
                        key={row.key}
                        type="monotone"
                        dataKey={row.key}
                        name={row.label}
                        stroke={row.color}
                        strokeOpacity={isDimmed ? DIMMED_LINE_OPACITY : 1}
                        strokeWidth={2}
                        strokeDasharray={
                          row.groupedCount || row.key === SigningOperationStatus.Failed
                            ? "4 2"
                            : undefined
                        }
                        dot={isDimmed ? false : nonZeroDot(row.key, row.color)}
                        activeDot={{ r: 4 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <SigningActivityLegend
              view={view}
              series={series}
              total={legendTotal}
              orderBy={orderBy}
              orderDirection={orderDirection}
              onSortChange={(nextOrderBy, nextOrderDirection) => {
                setOrderBy(nextOrderBy);
                setOrderDirection(nextOrderDirection);
                setIsolatedKey(null);
              }}
              isolatedKey={activeIsolatedKey}
              onIsolatedKeyChange={setIsolatedKey}
              onHoveredKeyChange={setHoveredKey}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};
