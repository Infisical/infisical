import { useState } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isAgentVaultSessionLogBlockedByPlan } from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { AgentVaultSessionLogStorageType } from "@app/hooks/api/agentVault/enums";

import { SessionLogReadAccessAlert } from "./SessionLogReadAccessAlert";

export const SessionLogAlerts = () => {
  const { data: state } = useGetAgentVaultSessionLogSettings();
  const { data: health } = useGetAgentVaultSessionLogHealth();
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const settings = state?.settings ?? null;
  const storageType = settings?.storage.type;
  const isDefaultStorage = storageType === AgentVaultSessionLogStorageType.Default;
  const isBlockedByPlan = isAgentVaultSessionLogBlockedByPlan(settings, subscription);

  let planMessage: string | null = null;
  // Default storage can be on without anyone choosing it, so its message can't say the plan "no longer" includes it.
  if (isBlockedByPlan && isDefaultStorage) {
    planMessage =
      "Your plan doesn't include default storage, so session logs aren't being recorded. Upgrade to record and view them.";
  } else if (isBlockedByPlan) {
    planMessage =
      "Your plan no longer includes external storage. Upgrade to see recorded logs and keep recording. Recorded logs stay in your bucket.";
  }

  return (
    <>
      {health?.connectionError && (
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertDescription>{health.connectionError}</AlertDescription>
        </Alert>
      )}

      {planMessage && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>{planMessage}</p>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => setIsUpgradeOpen(true)}>
                Upgrade
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      {/* While the storage is broken, fixing it comes first, so its error shows alone. */}
      {!health?.connectionError && <SessionLogReadAccessAlert />}

      <AgentVaultSessionLogUpgradeModal
        isOpen={isUpgradeOpen}
        onOpenChange={setIsUpgradeOpen}
        storageType={storageType}
      />
    </>
  );
};
