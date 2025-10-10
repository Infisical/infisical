/* eslint-disable jsx-a11y/label-has-associated-control */
import { TAzureKeyVaultPkiSync } from "@app/hooks/api/pkiSyncs/types/azure-key-vault-sync";

const GenericFieldLabel = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="text-bunker-300 text-sm">{label}</label>
    <div className="mt-1">{children}</div>
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
