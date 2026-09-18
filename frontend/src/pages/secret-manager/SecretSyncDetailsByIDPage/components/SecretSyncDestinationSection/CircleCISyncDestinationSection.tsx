import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
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
      <Detail>
        <DetailLabel>Organization</DetailLabel>
        <DetailValue>{orgName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Project</DetailLabel>
        <DetailValue>{projectName}</DetailValue>
      </Detail>
    </>
  );
};
