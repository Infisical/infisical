import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TOCIVaultSync } from "@app/hooks/api/secretSyncs/types/oci-vault-sync";

type Props = {
  secretSync: TOCIVaultSync;
};

export const OCIVaultSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { compartmentOcid, keyOcid, vaultOcid }
  } = secretSync;

  return (
    <>
      <GenericFieldLabel label="Compartment OCID">{compartmentOcid}</GenericFieldLabel>
      <GenericFieldLabel label="Vault OCID">{vaultOcid}</GenericFieldLabel>
      <GenericFieldLabel label="Key OCID">{keyOcid}</GenericFieldLabel>
    </>
  );
};
