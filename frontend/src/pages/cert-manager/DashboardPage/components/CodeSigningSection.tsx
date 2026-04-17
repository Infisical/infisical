import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import {
  SigningOperationStatus,
  TSigningOperation,
  useListSigners,
  useListSigningOperations
} from "@app/hooks/api/signers";

import { formatTickLabel, legendFormatter, nonZeroDot, TREND_COLORS } from "./chart-theme";

type Props = {
  projectId: string;
};

const ALL_SIGNERS = "__all__";

const ranges = [
  { label: "7D", value: "7d", days: 7 },
  { label: "30D", value: "30d", days: 30 },
  { label: "6M", value: "6m", days: 180 }
];

const buildTrendData = (operations: TSigningOperation[], daysBack: number) => {
  const useDaily = daysBack <= 30;
  const formatKey = useDaily ? "yyyy-MM-dd" : "yyyy-MM";
  const bucketMap = new Map<string, { success: number; failed: number }>();

  operations.forEach((op) => {
    const key = format(new Date(op.createdAt), formatKey);
    const entry = bucketMap.get(key) || { success: 0, failed: 0 };
    if (op.status === SigningOperationStatus.Success) {
      entry.success += 1;
    } else {
      entry.failed += 1;
    }
    bucketMap.set(key, entry);
  });

  const now = new Date();
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - daysBack);
  cursor.setHours(0, 0, 0, 0);
  if (!useDaily) cursor.setDate(1);

  const result: { period: string; success: number; failed: number }[] = [];
  while (cursor <= now) {
    const key = format(cursor, formatKey);
    const entry = bucketMap.get(key) || { success: 0, failed: 0 };
    result.push({ period: key, ...entry });
    if (useDaily) {
      cursor.setDate(cursor.getDate() + 1);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return result;
};

export const CodeSigningSection = ({ projectId }: Props) => {
  const { data: signersData } = useListSigners({ projectId, limit: 100 });
  const signers = signersData?.signers || [];

  const [selectedSignerId, setSelectedSignerId] = useState<string>(ALL_SIGNERS);
  const [currentRange, setCurrentRange] = useState("30d");
  const activeDays = ranges.find((r) => r.value === currentRange)?.days || 30;

  const signerIds = signers.map((s) => s.id);
  const firstSignerId = signerIds[0] || "";
  const secondSignerId = signerIds[1] || "";
  const thirdSignerId = signerIds[2] || "";
  const fourthSignerId = signerIds[3] || "";
  const fifthSignerId = signerIds[4] || "";

  const { data: ops1 } = useListSigningOperations({ signerId: firstSignerId, limit: 100 });
  const { data: ops2 } = useListSigningOperations({ signerId: secondSignerId, limit: 100 });
  const { data: ops3 } = useListSigningOperations({ signerId: thirdSignerId, limit: 100 });
  const { data: ops4 } = useListSigningOperations({ signerId: fourthSignerId, limit: 100 });
  const { data: ops5 } = useListSigningOperations({ signerId: fifthSignerId, limit: 100 });

  const allOperationsMap = useMemo(() => {
    const map = new Map<string, TSigningOperation[]>();
    const queryResults = [
      { id: firstSignerId, data: ops1 },
      { id: secondSignerId, data: ops2 },
      { id: thirdSignerId, data: ops3 },
      { id: fourthSignerId, data: ops4 },
      { id: fifthSignerId, data: ops5 }
    ];
    queryResults.forEach(({ id, data }) => {
      if (id && data?.operations) {
        map.set(id, data.operations);
      }
    });
    return map;
  }, [
    firstSignerId,
    secondSignerId,
    thirdSignerId,
    fourthSignerId,
    fifthSignerId,
    ops1,
    ops2,
    ops3,
    ops4,
    ops5
  ]);

  const filteredOperations = useMemo(() => {
    let ops: TSigningOperation[];
    if (selectedSignerId === ALL_SIGNERS) {
      ops = Array.from(allOperationsMap.values()).flat();
    } else {
      ops = allOperationsMap.get(selectedSignerId) || [];
    }
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - activeDays);
    return ops
      .filter((op) => new Date(op.createdAt) >= cutoffDate)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [selectedSignerId, allOperationsMap, activeDays]);

  const trendData = useMemo(
    () => buildTrendData(filteredOperations, activeDays),
    [filteredOperations, activeDays]
  );

  if (signers.length === 0) {
    return null;
  }

  return (
    <UnstableCard>
      <UnstableCardHeader className="flex-row items-center gap-2">
        <UnstableCardTitle className="text-sm">Code Signing Activity</UnstableCardTitle>
        <div className="ml-auto flex items-center gap-2 pr-5">
          <div className="flex gap-0.5">
            {ranges.map((r) => (
              <Button
                key={r.value}
                size="xs"
                variant={currentRange === r.value ? "neutral" : "ghost"}
                onClick={() => setCurrentRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Select value={selectedSignerId} onValueChange={setSelectedSignerId}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="Select signer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SIGNERS}>All Signers</SelectItem>
              {signers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </UnstableCardHeader>
      <UnstableCardContent>
        {trendData.length === 0 ? (
          <UnstableEmpty className="h-[250px]">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No signing operations yet</UnstableEmptyTitle>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  color: "var(--color-foreground)"
                }}
              />
              <Legend formatter={legendFormatter} />
              <Line
                type="monotone"
                dataKey="success"
                stroke={TREND_COLORS.renewed}
                strokeWidth={2}
                dot={nonZeroDot("success", TREND_COLORS.renewed)}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke={TREND_COLORS.expired}
                strokeWidth={2}
                dot={nonZeroDot("failed", TREND_COLORS.expired)}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
