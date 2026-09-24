import { Alert, AlertDescription } from "@app/components/v3";
import { useGetAgentVaultActivityConfig } from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";

export const ActivityLoggingAlerts = () => {
  const { data, isPending } = useGetAgentVaultActivityConfig();

  const config = data?.config;
  const hasDestination = Boolean(config?.bucket);
  const isRecording = data ? isAgentVaultRecording(data.config) : false;

  const notRecordingReason = (() => {
    if (!hasDestination) {
      return "Activity logging isn't set up. Choose an AWS connection and a bucket to start recording what your agents reach.";
    }
    if (!config?.enabled) {
      return config?.appConnectionId
        ? "Recording is switched off. Activity already in the bucket is still readable, but nothing new is being stored."
        : "Recording is switched off, and without an AWS connection the activity already in the bucket can't be read.";
    }
    return "Recording is on, but the destination is incomplete, so nothing is being written to the bucket.";
  })();

  return (
    <>
      {data?.isStorageFull && (
        <Alert variant="danger">
          <AlertDescription>
            Activity logging has reached its limit for this organization. Contact Infisical support.
          </AlertDescription>
        </Alert>
      )}

      {!isPending && !isRecording && (
        <Alert variant="warning">
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}
    </>
  );
};
