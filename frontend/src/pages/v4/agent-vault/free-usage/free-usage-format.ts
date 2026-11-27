import {
  formatFreeUsageCount,
  formatFreeUsageReset
} from "@app/components/agent-vault/FreeUsage/free-usage-format";
import type { TAgentVaultFreeUsage } from "@app/hooks/api/agentVault/types";

export const formatFreeUsageSummary = ({ used, limit, resetsAt }: TAgentVaultFreeUsage) =>
  used >= limit
    ? `Limit reached, resets ${formatFreeUsageReset(resetsAt)}`
    : `${formatFreeUsageCount(used)} / ${formatFreeUsageCount(limit)} requests this month, resets ${formatFreeUsageReset(resetsAt)}`;
