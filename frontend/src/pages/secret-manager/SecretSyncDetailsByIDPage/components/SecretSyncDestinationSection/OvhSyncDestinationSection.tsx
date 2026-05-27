import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TOvhSync } from "@app/hooks/api/secretSyncs/types/ovh-sync";

type Props = {
  secretSync: TOvhSync;
};

export const OvhSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>Path</DetailLabel>
      <DetailValue>{path}</DetailValue>
    </Detail>
  );
};
