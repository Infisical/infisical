import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TDaytonaSync } from "@app/hooks/api/secretSyncs/types/daytona-sync";

type Props = {
  secretSync: TDaytonaSync;
};

export const DaytonaSyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <Detail>
      <DetailLabel>Organization</DetailLabel>
      <DetailValue>{destinationConfig.organizationName}</DetailValue>
    </Detail>
  );
};
