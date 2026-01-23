import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TCircleCISync } from "@app/hooks/api/secretSyncs/types/circleci-sync";

type Props = {
  secretSync: TCircleCISync;
};

export const CircleCISyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { projectName, projectSlug }
  } = secretSync;

  return <GenericFieldLabel label="Project">{projectName || projectSlug}</GenericFieldLabel>;
};
