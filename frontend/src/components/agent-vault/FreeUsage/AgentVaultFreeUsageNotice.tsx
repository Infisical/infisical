import { useEffect, useRef, useState } from "react";
import { TriangleAlertIcon, XIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button, IconButton } from "@app/components/v3";
import { AnalyticsEvent } from "@app/lib/analytics";

import { formatFreeUsageCount } from "./free-usage-format";
import { useAgentVaultFreeUsage } from "./useAgentVaultFreeUsage";

// Shown from 80% of the free requests to every member, closable once per visit.
export const AgentVaultFreeUsageNotice = () => {
  const [isClosed, setIsClosed] = useState(false);
  const hasTrackedView = useRef(false);
  const { freeUsage, isLimitReached, warn, canAddCard, openAddCard, trackPaywall } =
    useAgentVaultFreeUsage("agent-vault.free-usage-notice");

  const isShown = Boolean(freeUsage) && warn && !isClosed;
  const limit = freeUsage ? formatFreeUsageCount(freeUsage.limit) : "";
  const usageMessage = isLimitReached
    ? `This organization used its ${limit} free Agent Vault requests this month. Agent requests are refused until an admin adds a card or the month resets.`
    : `This organization used ${freeUsage ? formatFreeUsageCount(freeUsage.used) : ""} of its ${limit} free Agent Vault requests this month. Once they're used, agent requests are refused until an admin adds a card or the month resets.`;
  const message = canAddCard
    ? usageMessage
    : `${usageMessage} Ask an organization admin to add a card.`;

  useEffect(() => {
    if (!isShown || hasTrackedView.current) return;
    hasTrackedView.current = true;
    trackPaywall(AnalyticsEvent.PaywallViewed, message);
  }, [isShown, message, trackPaywall]);

  if (!isShown) return null;

  return (
    <Alert variant={isLimitReached ? "danger" : "warning"} className="mb-6 pr-10">
      <TriangleAlertIcon />
      <AlertDescription>
        <p>{message}</p>
        {canAddCard && (
          <AlertAction>
            <Button variant="outline" size="sm" onClick={() => openAddCard(message)}>
              Add Card
            </Button>
          </AlertAction>
        )}
      </AlertDescription>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Dismiss notice"
        onClick={() => setIsClosed(true)}
        className="absolute top-1.5 right-1.5 text-current"
      >
        <XIcon />
      </IconButton>
    </Alert>
  );
};
