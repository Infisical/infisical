import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TGitlabSync } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

type Props = {
  secretSync: TGitlabSync;
};

export const GitLabSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: {
      projectName,
      projectId,
      targetEnvironment,
      shouldProtectSecrets,
      shouldMaskSecrets,
      shouldHideSecrets
    }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Project Name">{projectName}</GenericFieldLabel>
      <GenericFieldLabel label="Project ID">{projectId}</GenericFieldLabel>
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
