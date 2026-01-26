import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCircleCISync } from "@app/hooks/api/secretSyncs/types/circleci-sync";

type Props = {
  secretSync: TCircleCISync;
};

export const CircleCISyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { orgName, projectName }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Organization">{orgName}</GenericFieldLabel>
      <GenericFieldLabel label="Project">{projectName}</GenericFieldLabel>
    </>
  );
};
