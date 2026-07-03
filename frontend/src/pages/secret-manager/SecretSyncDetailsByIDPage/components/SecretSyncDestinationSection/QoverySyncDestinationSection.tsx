import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TQoverySync } from "@app/hooks/api/secretSyncs/types/qovery-sync";

type Props = {
  secretSync: TQoverySync;
};

export const QoverySyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { organizationName, projectName, environmentId, environmentName }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{organizationName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Scope</DetailLabel>
        <DetailValue>{environmentId ? `Environment (${environmentName})` : "Project"}</DetailValue>
      </Detail>
    </>
  );
};
