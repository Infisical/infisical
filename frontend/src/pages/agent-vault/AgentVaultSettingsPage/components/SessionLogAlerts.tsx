import { useState } from "react";
import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { AgentVaultSessionLogUpgradeModal } from "@app/components/agent-vault/AgentVaultSessionLogUpgradeModal";
import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import { useSubscription } from "@app/context";
import {
  areAgentVaultSessionLogsOn,
  isAgentVaultSessionLogPlanLapsed
} from "@app/helpers/agentVaultSessionLogs";
import {
  useGetAgentVaultSessionLogCorsProbe,
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";

import { SessionLogReadAccessAlert } from "./SessionLogReadAccessAlert";

export const SessionLogAlerts = () => {
  const { data: config, isPending: isSettingsPending } = useGetAgentVaultSessionLogSettings();
  const { data: health, isPending: isHealthPending } = useGetAgentVaultSessionLogHealth();
  const { data: readCheck } = useGetAgentVaultSessionLogCorsProbe();
  const { subscription } = useSubscription();
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  const hasDestination = Boolean(config?.bucket);
  const isLapsed = Boolean(config && isAgentVaultSessionLogPlanLapsed(config, subscription));
  const isRecording = config ? areAgentVaultSessionLogsOn(config) : false;
  const isReadBlocked = Boolean(readCheck && readCheck.status !== "readable");

  const notRecordingReason = (() => {
    if (!config?.enabled) {
      if (!config?.appConnectionId) {
        return "Session logs are off, and without an AWS connection the logs already in the bucket can't be read.";
      }
      if (health?.connectionError || isReadBlocked)
        return "Session logs are off, so nothing new is being stored.";
      return "Session logs are off. Logs already in the bucket are still readable, but nothing new is being stored.";
    }
    return "Session logs are on, but Storage isn't complete, so nothing is being written to the bucket.";
  })();

  return (
    <>
      {health?.connectionError && (
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertDescription>{health.connectionError}</AlertDescription>
        </Alert>
      )}

      {health?.isStorageFull && (
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertDescription>
            Session logs have reached their limit for this organization. Contact Infisical support.
          </AlertDescription>
        </Alert>
      )}

      {isLapsed && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            <p>
              Your plan no longer includes session logs, so new requests aren&apos;t recorded.
              {config?.appConnectionId && " Saved logs stay viewable."}
            </p>
            <AlertAction>
              <Button variant="outline" size="sm" onClick={() => setIsUpgradeOpen(true)}>
                Upgrade
              </Button>
            </AlertAction>
          </AlertDescription>
        </Alert>
      )}

      {!isSettingsPending && !isHealthPending && hasDestination && !isLapsed && !isRecording && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}

      <SessionLogReadAccessAlert />

      <AgentVaultSessionLogUpgradeModal isOpen={isUpgradeOpen} onOpenChange={setIsUpgradeOpen} />
    </>
  );
};
