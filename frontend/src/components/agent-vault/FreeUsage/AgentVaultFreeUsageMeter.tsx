import { useEffect, useRef } from "react";
import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v3";
import { AnalyticsEvent } from "@app/lib/analytics";

import { formatFreeUsageSummary } from "./free-usage-format";
import { useAgentVaultFreeUsage } from "./useAgentVaultFreeUsage";

export const AgentVaultFreeUsageMeter = () => {
  const hasTrackedView = useRef(false);
  const { freeUsage, isLimitReached, warn, canAddPaymentMethod, openAddPaymentMethod, trackPaywall } =
    useAgentVaultFreeUsage("agent-vault.free-usage-meter");

  const summary = freeUsage ? formatFreeUsageSummary(freeUsage) : "";

  useEffect(() => {
    if (!freeUsage || !warn || hasTrackedView.current) return;
    hasTrackedView.current = true;
    trackPaywall(AnalyticsEvent.PaywallViewed, summary);
  }, [freeUsage, warn, summary, trackPaywall]);

  if (!freeUsage) return null;

  return (
    <>
      {warn && (
        <div className="mb-1 hidden justify-center group-data-[collapsible=icon]:flex">
          <span
            role="img"
            aria-label={`Free Agent Vault requests: ${summary}`}
            title={summary}
            className={twMerge("size-2 rounded-full bg-warning", isLimitReached && "bg-danger")}
          />
        </div>
      )}
      <div className="mx-2 mb-1 rounded-md border border-border bg-container p-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-medium">Free</span>
          {canAddPaymentMethod && (
            <Button variant="outline" size="xs" onClick={() => openAddPaymentMethod(summary)}>
              Add Payment Method
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
        <p className="mt-2 text-xs text-muted">{summary}</p>
      </div>
    </>
  );
};
