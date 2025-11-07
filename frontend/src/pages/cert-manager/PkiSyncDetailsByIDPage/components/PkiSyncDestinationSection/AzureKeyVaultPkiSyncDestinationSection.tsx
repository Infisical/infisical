/* eslint-disable jsx-a11y/label-has-associated-control */
import { TAzureKeyVaultPkiSync } from "@app/hooks/api/pkiSyncs/types/azure-key-vault-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-4">
    <p className="text-sm font-medium text-mineshaft-300">{label}</p>
    <div className="text-sm text-mineshaft-300">{children}</div>
  </div>
);

type Props = {
  pkiSync: TAzureKeyVaultPkiSync;
};

export const AzureKeyVaultPkiSyncDestinationSection = ({ pkiSync }: Props) => {
  return (
    <GenericFieldLabel label="Key Vault URL">
      {pkiSync.destinationConfig.vaultBaseUrl}
    </GenericFieldLabel>
  );
};
