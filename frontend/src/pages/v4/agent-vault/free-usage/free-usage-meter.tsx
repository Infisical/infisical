import { useEffect, useRef } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Progress } from "@infisical/cipher/ui/progress";
import { SmallText } from "@infisical/cipher/ui/text";

import { AnalyticsEvent } from "@app/lib/analytics";

import { formatFreeUsageSummary } from "./free-usage-format";
import { useAgentVaultFreeUsage } from "./use-free-usage";

export const FreeUsageMeter = ({ orgId }: { orgId: string }) => {
  const hasTrackedView = useRef(false);
  const {
    freeUsage,
    isLimitReached,
    warn,
    canAddPaymentMethod,
    openAddPaymentMethod,
    trackPaywall
  } = useAgentVaultFreeUsage(orgId, "agent-vault.free-usage-meter");
  const summary = freeUsage ? formatFreeUsageSummary(freeUsage) : "";

  useEffect(() => {
    if (!freeUsage || !warn || hasTrackedView.current) return;
    hasTrackedView.current = true;
    trackPaywall(AnalyticsEvent.PaywallViewed, summary);
  }, [freeUsage, warn, summary, trackPaywall]);

  if (!freeUsage) return null;

  let tone: "ink" | "warn" | "bad" = "ink";
  if (isLimitReached) tone = "bad";
  else if (warn) tone = "warn";

  return (
    <section
      aria-label="Free Agent Vault requests"
      className="flex flex-col gap-2 border border-[color:var(--cipher-line-soft)] bg-[color:var(--cipher-surface)] p-3"
    >
      <div className="flex min-h-6 items-center gap-2">
        <span className="flex-1 text-sm font-medium">Free</span>
        {canAddPaymentMethod && (
          <Button variant="outline" size="xs" onClick={() => openAddPaymentMethod(summary)}>
            Add payment method
          </Button>
        )}
      </div>
      <Progress
        aria-label="Free requests used this month"
        value={Math.min(freeUsage.used, freeUsage.limit)}
        max={freeUsage.limit}
        tone={tone}
      />
      <SmallText muted>{summary}</SmallText>
    </section>
  );
};
