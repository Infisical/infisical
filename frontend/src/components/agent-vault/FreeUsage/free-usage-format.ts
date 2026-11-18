import { TAgentVaultFreeUsage } from "@app/hooks/api/agentVault/types";

export const formatFreeUsageCount = (count: number) => count.toLocaleString("en-US");

// The free month is a UTC calendar month, so the reset date is read in UTC too.
export const formatFreeUsageReset = (resetsAt: string) =>
  new Date(resetsAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });

export const formatFreeUsageSummary = ({ used, limit, resetsAt }: TAgentVaultFreeUsage) =>
  used >= limit
    ? `Limit reached · resets ${formatFreeUsageReset(resetsAt)}`
    : `${formatFreeUsageCount(used)} / ${formatFreeUsageCount(limit)} requests this month · resets ${formatFreeUsageReset(resetsAt)}`;
