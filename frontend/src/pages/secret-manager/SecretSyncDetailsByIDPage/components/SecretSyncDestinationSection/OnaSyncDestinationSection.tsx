import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TOnaSync } from "@app/hooks/api/secretSyncs/types/ona-sync";

type Props = {
  secretSync: TOnaSync;
};

export const OnaSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Ona Project</DetailLabel>
      <DetailValue>{destinationConfig.projectName || destinationConfig.projectId}</DetailValue>
    </Detail>
  );
};
