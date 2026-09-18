import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TTeamCitySync } from "@app/hooks/api/secretSyncs/types/teamcity-sync";

type Props = {
  secretSync: TTeamCitySync;
};

export const TeamCitySyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { project, buildConfig }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{project}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Build Configuration</DetailLabel>
        <DetailValue>{buildConfig}</DetailValue>
      </Detail>
    </>
  );
};
