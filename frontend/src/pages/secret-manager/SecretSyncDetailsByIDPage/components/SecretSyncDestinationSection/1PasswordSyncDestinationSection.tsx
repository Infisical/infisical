import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TOnePassSync } from "@app/hooks/api/secretSyncs/types/1password-sync";

type Props = {
  secretSync: TOnePassSync;
};

export const OnePassSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { vaultId, valueLabel }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Vault ID</DetailLabel>
        <DetailValue>{vaultId}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Value Key</DetailLabel>
        <DetailValue>{valueLabel || "value"}</DetailValue>
      </Detail>
    </>
  );
};
