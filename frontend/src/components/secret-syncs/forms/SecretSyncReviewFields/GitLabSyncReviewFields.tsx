import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const GitLabSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.GitLab }>();
  const projectName = watch("destinationConfig.projectName");
  const targetEnvironment = watch("destinationConfig.targetEnvironment");
  const groupName = watch("destinationConfig.groupName");
  const scope = watch("destinationConfig.scope");
  const shouldProtectSecrets = watch("destinationConfig.shouldProtectSecrets");
  const shouldMaskSecrets = watch("destinationConfig.shouldMaskSecrets");
  const shouldHideSecrets = watch("destinationConfig.shouldHideSecrets");

  return (
    <>
      <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
      {scope === GitlabSyncScope.Project && (
        <GenericFieldLabel label="Project Name">{projectName}</GenericFieldLabel>
      )}
      {scope === GitlabSyncScope.Group && (
        <GenericFieldLabel label="Group Name">{groupName}</GenericFieldLabel>
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
