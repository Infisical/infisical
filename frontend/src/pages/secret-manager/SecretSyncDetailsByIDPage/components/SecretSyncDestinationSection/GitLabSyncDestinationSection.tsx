import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { GitLabSyncScope, TGitLabSync } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

type Props = {
  secretSync: TGitLabSync;
};

export const GitLabSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: {
      targetEnvironment,
      shouldProtectSecrets,
      shouldMaskSecrets,
      shouldHideSecrets
    }
  } = secretSync;

  return (
    <>
      {secretSync.destinationConfig.scope === GitLabSyncScope.Project && (
        <>
          <Detail>
            <DetailLabel>Project Name</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.projectName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Project ID</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.projectId}</DetailValue>
          </Detail>
        </>
      )}
      {secretSync.destinationConfig.scope === GitLabSyncScope.Group && (
        <>
          <Detail>
            <DetailLabel>Group Name</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.groupName}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Group ID</DetailLabel>
            <DetailValue>{secretSync.destinationConfig.groupId}</DetailValue>
          </Detail>
        </>
      )}
      {targetEnvironment && (
        <Detail>
          <DetailLabel>Environment</DetailLabel>
          <DetailValue>{targetEnvironment}</DetailValue>
        </Detail>
      )}
      <Detail>
        <DetailLabel>Protect Secrets</DetailLabel>
        <DetailValue>{shouldProtectSecrets ? "Yes" : "No"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Mask Secrets</DetailLabel>
        <DetailValue>{shouldMaskSecrets ? "Yes" : "No"}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Hide Secrets</DetailLabel>
        <DetailValue>{shouldHideSecrets ? "Yes" : "No"}</DetailValue>
      </Detail>
    </>
  );
};
