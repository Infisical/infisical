import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TTravisCISync } from "@app/hooks/api/secretSyncs/types/travis-ci-sync";

type Props = {
  secretSync: TTravisCISync;
};

export const TravisCISyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Repository">{destinationConfig.repositorySlug}</GenericFieldLabel>
      {destinationConfig.branch && (
        <GenericFieldLabel label="Branch">{destinationConfig.branch}</GenericFieldLabel>
      )}
    </>
  );
};
