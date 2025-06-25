import { GenericFieldLabel } from "@app/components/secret-syncs";
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
          <GenericFieldLabel label="Project Name">
            {secretSync.destinationConfig.projectName}
          </GenericFieldLabel>
          <GenericFieldLabel label="Project ID">
            {secretSync.destinationConfig.projectId}
          </GenericFieldLabel>
        </>
      )}
      {secretSync.destinationConfig.scope === GitLabSyncScope.Group && (
        <>
          <GenericFieldLabel label="Group Name">
            {secretSync.destinationConfig.groupName}
          </GenericFieldLabel>
          <GenericFieldLabel label="Group ID">
            {secretSync.destinationConfig.groupId}
          </GenericFieldLabel>
        </>
      )}
      {targetEnvironment && (
        <GenericFieldLabel label="Environment">{targetEnvironment}</GenericFieldLabel>
      )}
      <GenericFieldLabel label="Protect Secrets">
        {shouldProtectSecrets ? "Yes" : "No"}
      </GenericFieldLabel>
      <GenericFieldLabel label="Mask Secrets">{shouldMaskSecrets ? "Yes" : "No"}</GenericFieldLabel>
      <GenericFieldLabel label="Hide Secrets">{shouldHideSecrets ? "Yes" : "No"}</GenericFieldLabel>
    </>
  );
};
