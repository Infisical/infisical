import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TSpaceliftSync } from "@app/hooks/api/secretSyncs/types/spacelift-sync";

type Props = {
  secretSync: TSpaceliftSync;
};

export const SpaceliftSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { contextId, contextName }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Context</DetailLabel>
        <DetailValue>{contextName}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Context ID</DetailLabel>
        <DetailValue>{contextId}</DetailValue>
      </Detail>
    </>
  );
};
