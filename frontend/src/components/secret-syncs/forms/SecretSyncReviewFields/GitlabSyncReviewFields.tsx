import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const GitLabSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Gitlab }>();
  const projectId = watch("destinationConfig.projectId");
  const targetEnvironment = watch("destinationConfig.targetEnvironment");
  const groupId = watch("destinationConfig.groupId");
  const scope = watch("destinationConfig.scope");
  const shouldProtectSecrets = watch("destinationConfig.shouldProtectSecrets");
  const shouldMaskSecrets = watch("destinationConfig.shouldMaskSecrets");
  const shouldHideSecrets = watch("destinationConfig.shouldHideSecrets");

  return (
    <>
      <GenericFieldLabel label="Scope">{scope}</GenericFieldLabel>
      <GenericFieldLabel label="Project ID">{projectId}</GenericFieldLabel>
      {groupId && <GenericFieldLabel label="Group ID">{groupId}</GenericFieldLabel>}
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
