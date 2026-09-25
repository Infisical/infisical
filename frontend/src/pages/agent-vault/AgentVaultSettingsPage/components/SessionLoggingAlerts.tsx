import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v3";
import {
  useGetAgentVaultActivityLoggingCorsProbe,
  useGetAgentVaultActivityLoggingHealth,
  useGetAgentVaultActivityLoggingSettings
} from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";

import { SessionLoggingReadAccessAlert } from "./SessionLoggingReadAccessAlert";

export const SessionLoggingAlerts = () => {
  const { data: config, isPending: isSettingsPending } = useGetAgentVaultActivityLoggingSettings();
  const { data: health, isPending: isHealthPending } = useGetAgentVaultActivityLoggingHealth();
  const { data: readAccess } = useGetAgentVaultActivityLoggingCorsProbe();

  const hasDestination = Boolean(config?.bucket);
  const isRecording = config ? isAgentVaultRecording(config) : false;
  const isReadBlocked = readAccess === "cors-missing" || readAccess === "access-denied";

  const notRecordingReason = (() => {
    if (!hasDestination) {
      return "Session logging isn't set up. Choose an AWS connection and a bucket to start recording what your agents reach.";
    }
    if (!config?.enabled) {
      if (!config?.appConnectionId) {
        return "Session logging is off, and without an AWS connection the logs already in the bucket can't be read.";
      }
      if (health?.connectionError || isReadBlocked)
        return "Session logging is off, so nothing new is being stored.";
      return "Session logging is off. Logs already in the bucket are still readable, but nothing new is being stored.";
    }
    return "Session logging is enabled, but Storage isn't complete, so nothing is being written to the bucket.";
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
            Session logging has reached its limit for this organization. Contact Infisical support.
          </AlertDescription>
        </Alert>
      )}

      {!isSettingsPending && !isHealthPending && !isRecording && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}

      <SessionLoggingReadAccessAlert />
    </>
  );
};
