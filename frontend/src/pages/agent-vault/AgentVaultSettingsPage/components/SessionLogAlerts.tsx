import { useState } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { isAgentVaultSessionLogPlanLapsed } from "@app/helpers/agentVaultSessionLogs";
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
  const isLapsed = isAgentVaultSessionLogPlanLapsed(settings, subscription);

  let planMessage: string | null = null;
  if (isLapsed && isDefaultStorage) {
    planMessage =
      "Your plan no longer includes default storage. Upgrade to see recorded logs and keep recording.";
  } else if (isLapsed) {
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
