import { Detail, DetailLabel, DetailValue } from "@app/components/v3";
import { TAzureEntraIdScimSync } from "@app/hooks/api/secretSyncs/types/azure-entra-id-scim-sync";

type Props = {
  secretSync: TAzureEntraIdScimSync;
};

export const AzureEntraIdScimSyncDestinationSection = ({ secretSync }: Props) => {
  const {
    destinationConfig: { servicePrincipalDisplayName, servicePrincipalId }
  } = secretSync;

  return (
    <Detail>
      <DetailLabel>SCIM Service Principal</DetailLabel>
      <DetailValue>{servicePrincipalDisplayName || servicePrincipalId}</DetailValue>
    </Detail>
  );
};
