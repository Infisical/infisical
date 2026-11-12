import { useFormContext } from "react-hook-form";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { JENKINS_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { JenkinsSyncScope } from "@app/hooks/api/secretSyncs/types/jenkins-sync";

export const JenkinsSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm & { destination: SecretSync.Jenkins }>();
  const scope = watch("destinationConfig.scope");
  const folderPath = watch("destinationConfig.folderPath");

  return (
    <>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{JENKINS_SYNC_SCOPE_LABELS[scope]}</DetailValue>
      </Detail>
      {scope === JenkinsSyncScope.Folder && (
        <Detail>
          <DetailLabel>Folder</DetailLabel>
          <DetailValue>{folderPath}</DetailValue>
        </Detail>
      )}
    </>
  );
};
