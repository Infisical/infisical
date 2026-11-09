import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { JENKINS_SYNC_SCOPE_LABELS } from "@app/helpers/secretSyncs";
import { JenkinsSyncScope, TJenkinsSync } from "@app/hooks/api/secretSyncs/types/jenkins-sync";

type Props = {
  secretSync: TJenkinsSync;
};

export const JenkinsSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{JENKINS_SYNC_SCOPE_LABELS[destinationConfig.scope]}</DetailValue>
      </Detail>
      {destinationConfig.scope === JenkinsSyncScope.Folder && (
        <Detail>
          <DetailLabel>Folder</DetailLabel>
          <DetailValue>{destinationConfig.folderPath}</DetailValue>
        </Detail>
      )}
    </>
  );
};
