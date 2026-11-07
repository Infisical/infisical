import { useState } from "react";

import { Select } from "@app/components/v4/ui/select";
import { SigningOperationStatus, type TSigningOperation } from "@app/hooks/api/signers/types";

import { useV4Adapter } from "../../../data/adapters";
import { ranges } from "./dashboard.utils";
import { TrendCard } from "./TrendCard";

const ALL_SIGNERS = "__all__";

const buildTrendData = (operations: TSigningOperation[], daysBack: number) => {
  const daily = daysBack <= 30;
  const keyOf = (date: Date) => date.toISOString().slice(0, daily ? 10 : 7);
  const buckets = new Map<string, { success: number; failed: number }>();
  operations.forEach((operation) => {
    const key = keyOf(new Date(operation.createdAt));
    const entry = buckets.get(key) ?? { success: 0, failed: 0 };
    if (operation.status === SigningOperationStatus.Success) entry.success += 1;
    else entry.failed += 1;
    buckets.set(key, entry);
  });
  const now = new Date();
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - daysBack);
  cursor.setHours(0, 0, 0, 0);
  if (!daily) cursor.setDate(1);
  const result: { period: string; success: number; failed: number }[] = [];
  while (cursor <= now) {
    const key = keyOf(cursor);
    result.push({ period: key, ...(buckets.get(key) ?? { success: 0, failed: 0 }) });
    if (daily) cursor.setDate(cursor.getDate() + 1);
    else cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
};

export const CodeSigningSection = ({ projectId }: { projectId: string }) => {
  const adapter = useV4Adapter("certificates");
  const { data: signersData } = adapter.useSigners({ projectId, limit: 100 });
  const signers = signersData?.signers ?? [];
  const [selectedSignerId, setSelectedSignerId] = useState(ALL_SIGNERS);
  const [range, setRange] = useState("30d");
  const activeDays = ranges.find((entry) => entry.value === range)?.days ?? 30;

  const signerIds = [0, 1, 2, 3, 4].map((index) => signers[index]?.id ?? "");
  const ops1 = adapter.useSigningOperations({ signerId: signerIds[0], limit: 100 }).data;
  const ops2 = adapter.useSigningOperations({ signerId: signerIds[1], limit: 100 }).data;
  const ops3 = adapter.useSigningOperations({ signerId: signerIds[2], limit: 100 }).data;
  const ops4 = adapter.useSigningOperations({ signerId: signerIds[3], limit: 100 }).data;
  const ops5 = adapter.useSigningOperations({ signerId: signerIds[4], limit: 100 }).data;

  const bySigner = new Map<string, TSigningOperation[]>();
  [ops1, ops2, ops3, ops4, ops5].forEach((data, index) => {
    if (signerIds[index] && data?.operations) bySigner.set(signerIds[index], data.operations);
  });
  const operations =
    selectedSignerId === ALL_SIGNERS
      ? [...bySigner.values()].flat()
      : (bySigner.get(selectedSignerId) ?? []);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - activeDays);
  const trendData = buildTrendData(
    operations.filter((operation) => new Date(operation.createdAt) >= cutoff),
    activeDays
  );

  if (signers.length === 0) return null;

  return (
    <TrendCard
      title="Code signing activity"
      data={trendData}
      range={range}
      onRangeChange={setRange}
      emptyTitle="No signing operations yet"
      series={[
        { key: "success", label: "Success", color: "var(--v4-ok)" },
        { key: "failed", label: "Failed", color: "var(--v4-bad)", dashed: true }
      ]}
      controls={
        <Select
          size="sm"
          aria-label="Signer"
          value={selectedSignerId}
          onValueChange={setSelectedSignerId}
          options={[
            { value: ALL_SIGNERS, label: "All signers" },
            ...signers.map((signer) => ({ value: signer.id, label: signer.name }))
          ]}
        />
      }
    />
  );
};
