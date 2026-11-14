import { useState } from "react";
import { TriangleAlertIcon, XIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button, IconButton } from "@app/components/v3";

import { formatFreeUsageCount, formatFreeUsageReset } from "./free-usage-format";
import { useAgentVaultFreeUsage } from "./useAgentVaultFreeUsage";

// Shown from 80% of the free requests to every member, closable once per visit.
export const AgentVaultFreeUsageNotice = () => {
  const [isClosed, setIsClosed] = useState(false);
  const { freeUsage, isLimitReached, warn, canAddCard, openAddCard, upgradeGate } =
    useAgentVaultFreeUsage("agent-vault.free-usage-notice");

  if (!freeUsage || !warn || isClosed) return null;

  const limit = formatFreeUsageCount(freeUsage.limit);
  const resetsOn = formatFreeUsageReset(freeUsage.resetsAt);
  const message = isLimitReached
    ? `This organization used its ${limit} free Agent Vault requests this month. Proxies stop attaching credentials until a card is added or the limit resets on ${resetsOn}.`
    : `This organization used ${formatFreeUsageCount(freeUsage.used)} of its ${limit} free Agent Vault requests this month. Once they're used, proxies stop attaching credentials until a card is added or the limit resets on ${resetsOn}.`;

  return (
    <>
      <Alert variant={isLimitReached ? "danger" : "warning"} className="mb-6 pr-10">
        <TriangleAlertIcon />
        <AlertDescription>
          <p>
            {message}
            {!canAddCard && " Ask an admin with billing access to add a card."}
          </p>
          {canAddCard && (
            <AlertAction>
              <Button variant="outline" size="sm" onClick={openAddCard}>
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
      {upgradeGate}
    </>
  );
};
