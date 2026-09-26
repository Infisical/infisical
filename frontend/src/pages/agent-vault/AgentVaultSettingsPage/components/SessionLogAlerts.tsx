import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v3";
import {
  useGetAgentVaultSessionLogCorsProbe,
  useGetAgentVaultSessionLogHealth,
  useGetAgentVaultSessionLogSettings
} from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";

import { SessionLogReadAccessAlert } from "./SessionLogReadAccessAlert";

export const SessionLogAlerts = () => {
  const { data: config, isPending: isSettingsPending } = useGetAgentVaultSessionLogSettings();
  const { data: health, isPending: isHealthPending } = useGetAgentVaultSessionLogHealth();
  const { data: readAccess } = useGetAgentVaultSessionLogCorsProbe();

  const hasDestination = Boolean(config?.bucket);
  const isRecording = config ? isAgentVaultRecording(config) : false;
  const isReadBlocked = readAccess === "cors-missing" || readAccess === "access-denied";

  const notRecordingReason = (() => {
    if (!hasDestination) {
      return "Session logs aren't set up. Choose an AWS connection and a bucket to start recording what your agents reach.";
    }
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

      {!isSettingsPending && !isHealthPending && !isRecording && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}

      <SessionLogReadAccessAlert />
    </>
  );
};
