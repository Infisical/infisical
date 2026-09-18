import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GitLabSyncScope } from "@app/hooks/api/secretSyncs/types/gitlab-sync";

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
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{scope}</DetailValue>
      </Detail>
      {scope === GitLabSyncScope.Project && (
        <Detail>
          <DetailLabel>Project Name</DetailLabel>
          <DetailValue>{projectName}</DetailValue>
        </Detail>
      )}
      {scope === GitLabSyncScope.Group && (
        <Detail>
          <DetailLabel>Group Name</DetailLabel>
          <DetailValue>{groupName}</DetailValue>
        </Detail>
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
