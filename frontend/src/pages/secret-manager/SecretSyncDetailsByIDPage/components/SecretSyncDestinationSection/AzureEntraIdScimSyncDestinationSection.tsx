import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TAzureEntraIdScimSync } from "@app/hooks/api/secretSyncs/types/azure-entra-id-scim-sync";

type Props = {
  secretSync: TAzureEntraIdScimSync;
};

export const AzureEntraIdScimSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { servicePrincipalDisplayName, servicePrincipalId }
  } = secretSync;

  return (
    <GenericFieldLabel label="SCIM Service Principal">
      {servicePrincipalDisplayName || servicePrincipalId}
    </GenericFieldLabel>
  );
};
