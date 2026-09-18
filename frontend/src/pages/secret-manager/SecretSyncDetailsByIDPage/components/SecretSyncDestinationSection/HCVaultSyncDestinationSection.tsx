import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { THCVaultSync } from "@app/hooks/api/secretSyncs/types/hc-vault-sync";

type Props = {
  secretSync: THCVaultSync;
};

export const HCVaultSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { path, mount }
  } = secretSync;

  return (
    <>
      <Detail>
        <DetailLabel>Secrets Engine Mount</DetailLabel>
        <DetailValue>{mount}</DetailValue>
      </Detail>
      <Detail>
        <DetailLabel>Path</DetailLabel>
        <DetailValue>{path}</DetailValue>
      </Detail>
    </>
  );
};
