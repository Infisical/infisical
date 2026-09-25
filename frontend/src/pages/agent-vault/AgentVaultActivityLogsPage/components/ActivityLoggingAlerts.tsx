import { Alert, AlertDescription } from "@app/components/v3";
import {
  useGetAgentVaultActivityLoggingHealth,
  useGetAgentVaultActivityLoggingSettings
} from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";

export const ActivityLoggingAlerts = () => {
  const { data: config, isPending: isSettingsPending } = useGetAgentVaultActivityLoggingSettings();
  const { data: health, isPending: isHealthPending } = useGetAgentVaultActivityLoggingHealth();

  const hasDestination = Boolean(config?.bucket);
  const isRecording = config ? isAgentVaultRecording(config) : false;

  const notRecordingReason = (() => {
    if (!hasDestination) {
      return "Activity logging isn't set up. Choose an AWS connection and a bucket to start recording what your agents reach.";
    }
    if (!config?.enabled) {
      if (!config?.appConnectionId) {
        return "Activity logging is off, and without an AWS connection the activity already in the bucket can't be read.";
      }
      if (health?.connectionError)
        return "Activity logging is off, so nothing new is being stored.";
      return "Activity logging is off. Activity already in the bucket is still readable, but nothing new is being stored.";
    }
    return "Activity logging is enabled, but Storage isn't complete, so nothing is being written to the bucket.";
  })();

  return (
    <>
      {health?.connectionError && (
        <Alert variant="danger">
          <AlertDescription>{health.connectionError}</AlertDescription>
        </Alert>
      )}

      {health?.isStorageFull && (
        <Alert variant="danger">
          <AlertDescription>
            Activity logging has reached its limit for this organization. Contact Infisical support.
          </AlertDescription>
        </Alert>
      )}

      {!isSettingsPending && !isHealthPending && !isRecording && (
        <Alert variant="warning">
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}
    </>
  );
};
