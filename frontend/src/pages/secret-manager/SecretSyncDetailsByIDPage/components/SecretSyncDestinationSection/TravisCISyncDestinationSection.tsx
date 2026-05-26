import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TTravisCISync } from "@app/hooks/api/secretSyncs/types/travis-ci-sync";

type Props = {
  secretSync: TTravisCISync;
};

export const TravisCISyncDestinationSection = ({ secretSync }: Props) => {
  const { destinationConfig } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Repository</DetailLabel>
        <DetailValue>{destinationConfig.repositorySlug}</DetailValue>
      </Detail>
      {destinationConfig.branch && (
        <Detail>
          <DetailLabel>Branch</DetailLabel>
          <DetailValue>{destinationConfig.branch}</DetailValue>
        </Detail>
      )}
    </>
  );
};
