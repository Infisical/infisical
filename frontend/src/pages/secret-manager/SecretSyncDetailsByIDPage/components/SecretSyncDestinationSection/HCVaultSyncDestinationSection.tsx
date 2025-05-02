import { GenericFieldLabel } from "@app/components/secret-syncs";
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
      <GenericFieldLabel label="Secrets Engine Mount">{mount}</GenericFieldLabel>
      <GenericFieldLabel label="Path">{path}</GenericFieldLabel>
    </>
  );
};
