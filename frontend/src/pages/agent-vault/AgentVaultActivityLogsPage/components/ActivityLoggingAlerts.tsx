import { Alert, AlertDescription } from "@app/components/v3";
import { useGetAgentVaultActivityConfig } from "@app/hooks/api/agentVault";
import { isAgentVaultRecording } from "@app/hooks/api/agentVault/types";

/**
 * Page-level state, deliberately a sibling of the page header rather than part of the card below.
 * It sits in the page's own spacing, matching how the sessions page carries the same warning, and
 * it reads as "here is what is wrong" ahead of "here is the configuration".
 *
 * Shares the config query with the section beside it; React Query serves both from one request.
 */
export const ActivityLoggingAlerts = () => {
  const { data, isPending } = useGetAgentVaultActivityConfig();

  const config = data?.config;
  const hasDestination = Boolean(config?.bucket);
  const isRecording = data ? isAgentVaultRecording(data.config) : false;

  // Three different problems reach this banner, and "nothing is being recorded" is true of all of
  // them and useful for none. Each one names what is wrong and what it costs.
  const notRecordingReason = (() => {
    if (!hasDestination) {
      return "Activity logging isn't set up. Choose an AWS connection and a bucket to start recording what your agents reach.";
    }
    if (!config?.enabled) {
      return "Recording is switched off. Activity already in the bucket is still readable, but nothing new is being stored.";
    }
    if (!config.appConnectionId) {
      return "Recording is on, but its AWS connection is gone. Nothing can be written to the bucket until you choose another one.";
    }
    return "Recording is on, but the destination is incomplete, so nothing is being written to the bucket.";
  })();

  return (
    <>
      {data?.isStorageFull && (
        <Alert variant="danger">
          <AlertDescription>
            Activity storage for this organization is full, and nothing new is being recorded.
            Contact Infisical support.
          </AlertDescription>
        </Alert>
      )}

      {/* Keyed on the query having resolved, or an org that is recording perfectly well flashes a
          warning on every cold load. */}
      {!isPending && !isRecording && (
        <Alert variant="warning">
          <AlertDescription>{notRecordingReason}</AlertDescription>
        </Alert>
      )}
    </>
  );
};
