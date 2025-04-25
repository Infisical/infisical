import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="Project">{project}</GenericFieldLabel>
      <GenericFieldLabel label="Build Configuration">{buildConfig}</GenericFieldLabel>
    </>
  );
};
