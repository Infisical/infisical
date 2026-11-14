import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v3";

import { formatFreeUsageSummary } from "./free-usage-format";
import { useAgentVaultFreeUsage } from "./useAgentVaultFreeUsage";

export const AgentVaultFreeUsageMeter = () => {
  const { freeUsage, isLimitReached, warn, canAddCard, openAddCard, upgradeGate } =
    useAgentVaultFreeUsage("agent-vault.free-usage-meter");

  if (!freeUsage) return null;

  return (
    <div className="mx-2 mb-1 rounded-md border border-border bg-container p-3 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm font-medium">Free</span>
        {canAddCard && (
          <Button variant="outline" size="xs" onClick={openAddCard}>
            Add Card
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Free requests used this month"
        aria-valuemin={0}
        aria-valuemax={freeUsage.limit}
        aria-valuenow={Math.min(freeUsage.used, freeUsage.limit)}
        className="mt-2 h-1 overflow-hidden rounded-full bg-border"
      >
        <div
          className={twMerge(
            "h-full rounded-full bg-product-av",
            warn && "bg-warning",
            isLimitReached && "bg-danger"
          )}
          style={{ width: `${Math.min(freeUsage.used / freeUsage.limit, 1) * 100}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted">{formatFreeUsageSummary(freeUsage)}</p>
      {upgradeGate}
    </div>
  );
};
